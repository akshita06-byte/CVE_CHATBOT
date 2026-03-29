from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import logging
import time
import re
from typing import Optional, Dict, Any, List
try:
    import numpy as np
except Exception:
    np = None

# Optional embedding + faiss support
_FAISS_AVAILABLE = False
_FAISS_INDEX = None
_FAISS_ID_MAP: List[str] = []
_EMBED_MODEL = None

try:
    from sentence_transformers import SentenceTransformer
    import faiss
    _FAISS_AVAILABLE = True
except Exception:
    try:
        logger.info('sentence-transformers or faiss not available; vector search disabled')
    except Exception:
        # logger may not be initialized in some import-time execution contexts
        print('sentence-transformers or faiss not available; vector search disabled')

from dotenv import load_dotenv
load_dotenv()


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CVE Chatbot FastAPI Backend", version="2.0")

# DB logging integration (backend2)
try:
    try:
        from db import engine
        from logger import ensure_tables, write_log_direct
    except ImportError:
        from server.db import engine
        from server.logger import ensure_tables, write_log_direct
    try:
        ensure_tables()
    except Exception:
        logger.exception('Failed to ensure DB tables')
except Exception:
    # If SQLAlchemy or DB modules are missing, continue without logging
    logger.info('DB logging not available')

# Admin token for quick verification endpoint (change in env in production)
import os
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', 'devtoken')
try:
    from db import SessionLocal
    from models import UserActivityLog
except ImportError:
    from server.db import SessionLocal
    from server.models import UserActivityLog

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Simple auth endpoints (file-backed) ---------------------------------
import base64
import hashlib
import hmac

USERS_FILE = os.path.join(os.path.dirname(__file__), 'users.json')

def _load_users():
    try:
        if not os.path.exists(USERS_FILE):
            return {}
        with open(USERS_FILE, 'r', encoding='utf-8') as fh:
            return json.load(fh) or {}
    except Exception:
        return {}

def _save_users(users):
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as fh:
            json.dump(users, fh, indent=2)
        return True
    except Exception:
        return False

def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return base64.b64encode(salt + dk).decode('ascii')

def _verify_password(stored: str, password: str) -> bool:
    try:
        raw = base64.b64decode(stored.encode('ascii'))
        salt = raw[:16]
        dk = raw[16:]
        newdk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return hmac.compare_digest(newdk, dk)
    except Exception:
        return False


from pydantic import BaseModel

class AuthRequest(BaseModel):
    username: str
    password: str


@app.post('/register')
async def register_user(req: AuthRequest):
    username = (req.username or '').strip()
    password = req.password or ''
    if not username or not password:
        return {'error': 'Username and password are required'}
    users = _load_users()
    if username in users:
        # client expects a 409-like message; FastAPI will default to 200 unless we raise
        raise HTTPException(status_code=409, detail='You are already registered, please login')
    users[username] = {'password_hash': _hash_password(password), 'created_at': time.time()}
    if not _save_users(users):
        raise HTTPException(status_code=500, detail='Failed to persist user')
    return {'message': 'Registration successful'}


@app.post('/login')
async def login_user(req: AuthRequest):
    username = (req.username or '').strip()
    password = req.password or ''
    if not username or not password:
        raise HTTPException(status_code=400, detail='Username and password are required')
    users = _load_users()
    user = users.get(username)
    if not user:
        raise HTTPException(status_code=401, detail='Invalid username or password')
    if not _verify_password(user.get('password_hash', ''), password):
        raise HTTPException(status_code=401, detail='Invalid username or password')
    return {'message': 'Login successful', 'username': username}

# -------------------------------------------------------------------------

# Configure Gemini (optional)
try:
    import google.generativeai as genai
    from dotenv import load_dotenv
    # load .env
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash')
        except Exception:
            model = None
            logger.exception('Failed to configure Gemini model; Gemini features disabled')
    else:
        model = None
        logger.info('GEMINI_API_KEY not set; Gemini features disabled')
except Exception:
    genai = None
    model = None
    try:
        logger.info('google.generativeai not available; Gemini features disabled')
    except Exception:
        print('google.generativeai not available; Gemini features disabled')

class CVERequest(BaseModel):
    cve_id: str

class CVEResponse(BaseModel):
    structured: Dict[str, Any]

def create_gemini_prompt(cve_id: str) -> str:
    """Create a structured prompt for Gemini to generate CVE data"""
    return f"""
You are a cybersecurity expert. Generate a comprehensive CVE analysis for {cve_id} in the following JSON structure:

{{
    "cve_id": "{cve_id}",
    "description": "Detailed description of the vulnerability",
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "cvss": {{
        "score": "numerical_score_or_null",
        "version": "3.1",
        "severity": "CRITICAL|HIGH|MEDIUM|LOW"
    }},
    "published_date": "YYYY-MM-DD",
    "modified_date": "YYYY-MM-DD",
    "cwes": ["CWE-XXX", "CWE-YYY"],
    "sources_used": ["GEMINI"],
    "common_consequences_table": {{
        "headers": ["Impact", "Details"],
        "rows": [
            ["Impact Type", "Detailed description of the impact"],
            ["Another Impact", "Another detailed description"]
        ]
    }},
    "potential_mitigations_table": {{
        "headers": ["Phase(s)", "Mitigation"],
        "rows": [
            ["Implementation", "Specific mitigation strategy"],
            ["Architecture and Design", "Design-level mitigation"]
        ]
    }},     
    "detection_methods_table": {{
        "headers": ["Method", "Details"],
        "rows": [
            ["Automated Static Analysis", "How to detect using static analysis"],
            ["Automated Dynamic Analysis", "How to detect using dynamic analysis"]
        ]
    }},
    "parameters": {{}}
}}

Requirements:
1. Provide accurate, detailed information about {cve_id}
2. Include realistic CVSS scores and severity levels
3. Generate meaningful CWE IDs that are relevant to the vulnerability
4. Create comprehensive tables with practical information
5. Ensure all dates are realistic
6. Make the response detailed and professional
7. Return ONLY valid JSON, no additional text or markdown formatting
8. Extract the most relevant keywords.
9. Find and list ~10 CVEs from the database with similar descriptions, using those keywords and semantic similarity.
10. For each similar CVE, provide its ID below the description of the CVE being analyzed.
Generate the analysis now:
"""


def _load_local_cve_cache() -> Dict[str, Dict[str, Any]]:
    """Load local CVE cache from ../backend/cve_cache.json if available."""
    try:
        base = os.path.dirname(__file__)
        cache_path = os.path.join(base, '..', 'backend', 'cve_cache.json')
        cache_path = os.path.normpath(cache_path)
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # Expecting either dict {cve_id: {...}} or list of entries
            if isinstance(data, dict):
                return data
            elif isinstance(data, list):
                return {entry.get('cve_id') or entry.get('id'): entry for entry in data}
    except Exception as e:
        logger.exception(f"Failed to load local CVE cache: {e}")
    return {}


def canonicalize_cve_id(token: str) -> Optional[str]:
    """Try to normalize various CVE input variants into standard 'CVE-YYYY-NNNN' format.

    Returns the canonical form (uppercase) or None if the token does not look like a CVE id.
    Examples handled:
      - CVE-2023-1234
      - cve20231234
      - cve_2023_01234
      - 2023-1234
      - client:ABC-2023-1234 (extracts the CVE portion)
    """
    if not token or not isinstance(token, str):
        return None
    t = token.strip()
    # Quick check for explicit CVE pattern
    m = re.search(r'(CVE)[^0-9A-Za-z]{0,3}?([0-9]{4})[^0-9A-Za-z]{0,3}?([0-9]{2,7})', t, flags=re.I)
    if m:
        year = m.group(2)
        # Preserve the numeric portion exactly as captured (including leading zeros)
        num = m.group(3) or '0'
        return f"CVE-{year}-{num}".upper()

    # Try to extract a contiguous digits string like 20231234 or 2023001234
    digits = re.sub(r'[^0-9]', '', t)
    if len(digits) >= 6:
        # assume first 4 are year
        year = digits[:4]
        rest = digits[4:]
        if len(year) == 4 and year.isdigit():
            # Keep the trailing numeric portion intact (do not strip leading zeros)
            num = rest or '0'
            return f"CVE-{year}-{num}".upper()

    # Not a CVE-like token
    return None


def _build_faiss_index(cache: Dict[str, Dict[str, Any]], model_name: str = "all-MiniLM-L6-v2"):
    """Build a FAISS index over CVE descriptions. This is lazy-initialized and cached in module globals."""
    global _FAISS_AVAILABLE, _FAISS_INDEX, _FAISS_ID_MAP, _EMBED_MODEL
    if not _FAISS_AVAILABLE:
        return
    try:
        # Initialize embed model if needed
        if _EMBED_MODEL is None:
            _EMBED_MODEL = SentenceTransformer(model_name)

        ids = []
        texts = []
        for cid, entry in cache.items():
            desc = (entry.get('description') or '')
            if not desc:
                desc = (entry.get('summary') or '')
            if not desc:
                desc = ''
            texts.append(desc)
            ids.append(cid)

        if not texts:
            return

        # Compute embeddings
        embs = _EMBED_MODEL.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        # Normalize embeddings for cosine similarity via inner product
        faiss.normalize_L2(embs)

        dim = embs.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embs)

        _FAISS_INDEX = index
        _FAISS_ID_MAP = ids
        logger.info(f'Built FAISS index with {len(ids)} vectors (dim={dim})')
    except Exception:
        logger.exception('Failed to build FAISS index')
        _FAISS_AVAILABLE = False


def _extract_keywords(text: str, max_keywords: int = 12) -> List[str]:
    """Very small keyword extractor: tokenize, remove short words and a small stoplist, return top tokens."""
    if not text:
        return []
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text).lower()
    tokens = [t for t in text.split() if len(t) > 3]
    stop = set(["the", "that", "this", "with", "from", "have", "using", "which", "when", "were", "also", "will", "than", "into", "they", "their", "other"]) 
    filtered = [t for t in tokens if t not in stop]
    # simple frequency
    freq = {}
    for t in filtered:
        freq[t] = freq.get(t, 0) + 1
    # sort by freq and length
    sorted_tokens = sorted(freq.keys(), key=lambda k: (-freq[k], -len(k)))
    return sorted_tokens[:max_keywords]


def _find_candidate_cves(description: str, cache: Dict[str, Dict[str, Any]], keywords: List[str], max_candidates: int = 50, exclude_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Return candidate CVEs. Prefer FAISS vector search (if available), otherwise use keyword scoring.

    exclude_ids: optional list of CVE ids to exclude from results (e.g., the query CVE)
    """
    if not cache:
        return []
    if exclude_ids is None:
        exclude_ids = []
    # normalize exclude ids
    exclude_set = set([e.upper() for e in exclude_ids if e])

    # Try FAISS-based retrieval when available
    if _FAISS_AVAILABLE and _FAISS_INDEX is None:
        # Build index lazily (ensure index reflects current cache)
        _build_faiss_index(cache)

    if _FAISS_AVAILABLE and _FAISS_INDEX is not None:
        try:
            # Compute embedding for input description
            if _EMBED_MODEL is None:
                _EMBED_MODEL = SentenceTransformer('all-MiniLM-L6-v2')
            q_emb = _EMBED_MODEL.encode([description], convert_to_numpy=True)
            faiss.normalize_L2(q_emb)
            k = min(max_candidates, len(_FAISS_ID_MAP))
            D, I = _FAISS_INDEX.search(q_emb, k)
            results = []
            for score, idx in zip(D[0], I[0]):
                if idx < 0 or idx >= len(_FAISS_ID_MAP):
                    continue
                cid = _FAISS_ID_MAP[idx]
                if cid is None:
                    continue
                if cid.upper() in exclude_set:
                    continue
                entry = cache.get(cid, {})
                results.append({'cve_id': cid, 'score': float(score), 'short_description': (entry.get('description') or '')[:300]})
            return results
        except Exception:
            logger.exception('FAISS retrieval failed, falling back to keyword retrieval')

    # Fallback: keyword-based retrieval
    descr = (description or "").lower()
    candidates = []
    kwset = set(keywords)
    for cid, entry in cache.items():
        try:
            if cid and cid.upper() in exclude_set:
                continue
            text = (entry.get('description') or '') + '\n' + '\n'.join(entry.get('references') or [])
            text = text.lower()
            # score = number of keyword occurrences + jaccard
            occ = sum(text.count(k) for k in kwset)
            words = set(re.findall(r"\w{4,}", text))
            inter = len(words & kwset)
            jaccard = inter / (len(words | kwset) or 1)
            score = occ + jaccard
            candidates.append({'cve_id': cid, 'score': score, 'short_description': (entry.get('description') or '')[:300]})
        except Exception:
            continue
    candidates.sort(key=lambda x: x['score'], reverse=True)
    return candidates[:max_candidates]


def _rank_with_gemini(original_desc: str, candidates: List[Dict[str, Any]], top_k: int = 10) -> List[Dict[str, Any]]:
    """Ask Gemini to refine and rank the candidate CVEs. Returns top_k entries with their IDs in order."""
    if not candidates:
        return []
    if model is None:
        try:
            logger.info('Gemini model unavailable; using local ranking fallback')
        except Exception:
            pass
        return candidates[:top_k]
    # Build a compact prompt with candidates
    prompt_lines = [
        "You are a cybersecurity expert. Given the target CVE description and a list of candidate CVEs with short descriptions, rank the candidates by similarity to the target description and return a JSON array of the top similar CVE ids in order (most similar first).",
        "\nTarget description:\n" + original_desc + "\n",
        "Candidates:\n"
    ]
    for c in candidates:
        short_desc = c['short_description'].replace('\n', ' ')
        prompt_lines.append(f"- {c['cve_id']}: {short_desc}")
    prompt_lines.append("\nReturn ONLY valid JSON: {\"top_cves\": [\"CVE-XXXX-YYYY\", ...]} and nothing else.")
    prompt = "\n".join(prompt_lines)

    try:
        resp = model.generate_content(prompt)
        text = resp.text.strip()
        # strip markdown fences
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        parsed = json.loads(text)
        ids = parsed.get('top_cves') if isinstance(parsed, dict) else None
        if isinstance(ids, list):
            # map ids back to candidate dicts preserving order
            id_map = {c['cve_id']: c for c in candidates}
            out = [id_map[i] for i in ids if i in id_map]
            return out[:top_k]
    except Exception:
        logger.exception('Gemini ranking failed, falling back to local ranking')

    # Fallback: just return top_k by local score
    return candidates[:top_k]


@app.post("/fastapi_get_cve", response_model=CVEResponse)
async def get_cve_data(request: CVERequest, x_user_name: Optional[str] = Header(None)):
    """
    Get CVE data using Gemini AI
    """
    try:
        logger.info(f"Processing CVE request for: {request.cve_id}")

        # Normalize incoming token when possible
        canonical = canonicalize_cve_id(request.cve_id)
        if canonical:
            cve_token = canonical
        else:
            # If not a CVE token, treat the input as a free-text description request
            cve_token = request.cve_id

        # If Gemini is not configured, return a minimal fallback response instead of calling the model
        if model is None:
            logger.info('Gemini not configured; returning fallback CVE data')
            # Try to load local cache entry if available
            cache = _load_local_cve_cache()
            entry = cache.get(cve_token) or cache.get(cve_token.upper()) or {}
            fallback_data = {
                "cve_id": cve_token,
                "description": entry.get('description') if isinstance(entry, dict) else f'No Gemini available; minimal info for {cve_token}',
                "severity": entry.get('severity') or 'UNKNOWN',
                "cvss": entry.get('cvss') or {"score": None, "version": "3.1", "severity": None},
                "published_date": entry.get('published_date') or 'Unknown',
                "modified_date": entry.get('modified_date') or 'Unknown',
                "cwes": entry.get('cwes') or entry.get('CWE') or [],
                "sources_used": ["LOCAL_FALLBACK"],
                "common_consequences_table": {"headers": ["Impact", "Details"], "rows": [["Info", "Gemini unavailable; local fallback used"]]},
                "potential_mitigations_table": {"headers": ["Phase(s)", "Mitigation"], "rows": [["Implementation", "Check local cache and logs"]]},
                "detection_methods_table": {"headers": ["Method", "Details"], "rows": [["Manual Review", "Review local cache"]]},
                "parameters": {}
            }
            return CVEResponse(structured=fallback_data)

        # Create the prompt
        prompt = create_gemini_prompt(cve_token)
        
        # Generate response from Gemini
        response = model.generate_content(prompt)
        # Attempt to write an activity log early so we capture the request even if parsing fails
        try:
            try:
                # attempt to write log; username not available here so use 'unknown'
                write_log_direct(cve_token, 'unknown', meta={'source': 'backend2', 'generated': True})
                logger.info('Activity log written for %s', cve_token)
            except Exception:
                logger.exception('Failed to write activity log (early) for %s', cve_token)
        except Exception:
            # be extra defensive - logging shouldn't break main flow
            logger.exception('Unexpected error while attempting to write early activity log')
        
        # Parse the JSON response
        try:
            # Clean the response text to extract JSON
            response_text = response.text.strip()
            
            # Remove any markdown formatting if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            # Parse JSON
            structured_data = json.loads(response_text)
            logger.info(f"Successfully generated CVE data for {cve_token}")

            # Attempt to write an activity log (non-blocking)
            try:
                user = (x_user_name or 'unknown')
                try:
                    write_log_direct(cve_token, user, meta={'source': 'backend2', 'generated': True})
                except Exception:
                    logger.exception('Failed to write activity log (backend2)')
            except Exception:
                logger.exception('Unexpected error during logging')

            return CVEResponse(structured=structured_data)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {e}")
            logger.error(f"Raw response: {response.text}")
            
            # Fallback: create a basic structure if JSON parsing fails
            fallback_data = {
                "cve_id": cve_token,
                "description": f"Analysis for {request.cve_id} - JSON parsing failed",
                "severity": "UNKNOWN",
                "cvss": {"score": None, "version": "3.1", "severity": None},
                "published_date": "Unknown",
                "modified_date": "Unknown",
                "cwes": [],
                "sources_used": ["GEMINI"],
                "common_consequences_table": {
                    "headers": ["Impact", "Details"],
                    "rows": [["Error", "Failed to parse AI response"]]
                },
                "potential_mitigations_table": {
                    "headers": ["Phase(s)", "Mitigation"],
                    "rows": [["Implementation", "Check system logs for more details"]]
                },
                "detection_methods_table": {
                    "headers": ["Method", "Details"],
                    "rows": [["Manual Review", "Review the raw AI response"]]
                },
                "parameters": {}
            }
            return CVEResponse(structured=fallback_data)
            
    except Exception as e:
        logger.error(f"Error processing CVE {request.cve_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing CVE request: {str(e)}")


class SimilarResponse(BaseModel):
    cves: List[Dict[str, Any]]


@app.post("/fastapi_find_similar", response_model=SimilarResponse)
async def find_similar_cves(request: CVERequest):
    """Find ~10 CVEs with descriptions similar to the given CVE id.

    Uses local cache + FAISS if available, otherwise asks Gemini directly.
    """
    try:
        cache = _load_local_cve_cache()

        # Normalize incoming token
        canonical = canonicalize_cve_id(request.cve_id)
        description = None

        if canonical and cache:
            entry = cache.get(canonical) or cache.get(canonical.upper()) or {}
            description = entry.get('description') if isinstance(entry, dict) else None

        # If no cache or no description found, ask Gemini for a description
        if not description and model is not None:
            try:
                r = model.generate_content(f"Provide a one-sentence description for {request.cve_id}. Return plain text only.")
                description = r.text.strip()
            except Exception:
                logger.exception("Failed to get description from Gemini")

        if not description:
            # Return empty list gracefully instead of crashing
            return SimilarResponse(cves=[])

        # If we have a cache, use keyword/FAISS search + Gemini ranking
        if cache:
            keywords = _extract_keywords(description)
            exclude = [canonical] if canonical else []
            candidates = _find_candidate_cves(description, cache, keywords, max_candidates=60, exclude_ids=exclude)
            ranked = _rank_with_gemini(description, candidates, top_k=10)
            out = [{'cve_id': r.get('cve_id'), 'score': r.get('score'), 'short_description': r.get('short_description')} for r in ranked]
            return SimilarResponse(cves=out)

        # No cache available — ask Gemini directly for similar CVEs
        if model is not None:
            prompt = f"""You are a cybersecurity expert. For the vulnerability {request.cve_id}, find 10 real, similar CVEs.
Return ONLY valid JSON in this format:
{{"cves": [{{"cve_id": "CVE-XXXX-YYYY", "short_description": "brief description"}}, ...]}}
No additional text."""
            try:
                resp = model.generate_content(prompt)
                text = resp.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                parsed = json.loads(text)
                cves = parsed.get('cves', [])
                return SimilarResponse(cves=cves[:10])
            except Exception:
                logger.exception("Gemini similar CVE lookup failed")

        return SimilarResponse(cves=[])

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error finding similar CVEs for {request.cve_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/admin/logs')
def admin_get_logs(limit: int = 20, x_admin_token: str | None = Header(None)):
    """Return recent activity logs for quick verification. Requires X-Admin-Token header."""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail='forbidden')
    try:
        db = SessionLocal()
        rows = db.query(UserActivityLog).order_by(UserActivityLog.id.desc()).limit(limit).all()
        return [
            {
                'id': r.id,
                'cve_id': r.cve_id,
                'user_name': r.user_name,
                'event_timestamp': r.event_timestamp.isoformat(),
                'event_date': r.event_date.isoformat(),
                'meta': r.meta,
            }
            for r in rows
        ]
    finally:
        db.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "CVE Chatbot FastAPI Backend",
        "version": "2.0"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('BACKEND_PORT', '5003'))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
