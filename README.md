# NGen Connect — Manufacturing Matchmaker

Discover Canadian manufacturers, suppliers, and technology providers across the Industry 4.0 ecosystem.

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Export your data (run from ngen_connect_pipeline/)
python3 step5_export_for_vercel.py

# 3. Copy the exported data
cp ngen_connect_pipeline/ngen-connect-web/data/companies.json data/companies.json

# 4. Set API keys
cp .env.example .env.local
# Edit .env.local with your keys (at minimum GEMINI_API_KEY)

# 5. Run
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "NGen Connect v1"
gh repo create ngen-connect --private --push

# 2. Deploy
npx vercel

# 3. Set env vars in Vercel dashboard:
#    Settings → Environment Variables → Add GEMINI_API_KEY (+ optional others)
```

## Architecture

- **Search**: Cosine similarity over 1,000 company embeddings (in-memory, ~8MB JSON)
- **Embeddings**: Gemini `gemini-embedding-001` (768 dims)
- **Chat**: Auto-selects best available LLM (Claude > GPT-4.1 > DeepSeek > Gemini Flash)
- **Filters**: Sector, capabilities, certifications, materials, province, company size
