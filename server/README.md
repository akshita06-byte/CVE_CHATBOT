# CVE Chatbot FastAPI Backend

A minimalistic FastAPI backend that uses Google's Gemini AI to generate structured CVE vulnerability data.

## Setup

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Set up your Gemini API key:

   - Copy `env_example.txt` to `.env`
   - Add your Gemini API key to the `.env` file

3. Run the server:

```bash
python main.py
```

The server will run on `http://127.0.0.1:5003`

## API Endpoints

- `POST /fastapi_get_cve` - Get CVE data using Gemini AI
- `GET /health` - Health check endpoint

## Usage

Send a POST request to `/fastapi_get_cve` with:

```json
{
  "cve_id": "CVE-2021-44228"
}
```

The response will be a structured JSON object containing comprehensive CVE analysis data.
