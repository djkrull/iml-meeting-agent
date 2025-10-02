# Deployment Guide

This application consists of two parts that need to be deployed separately:
1. **Frontend** (React app) → Vercel
2. **Backend** (Express API + SQLite) → Railway

## Backend Deployment (Railway)

### Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account and select this repository
5. Railway will automatically detect the `railway.json` configuration

### Step 2: Configure Environment Variables

In your Railway project dashboard, add the following environment variable:
- `PORT`: Railway will set this automatically (usually 3000 or dynamic)

### Step 3: Deploy

Railway will automatically:
- Install dependencies from `package.json`
- Run `node server/index.js` as defined in `railway.json`
- Provide you with a public URL (e.g., `https://your-app.up.railway.app`)

### Step 4: Note Your Backend URL

Copy the Railway deployment URL - you'll need it for the frontend configuration.

## Frontend Deployment (Vercel)

### Step 1: Configure Environment Variable

In your Vercel project dashboard:
1. Go to Settings → Environment Variables
2. Add a new variable:
   - **Name**: `REACT_APP_API_URL`
   - **Value**: Your Railway backend URL (e.g., `https://your-app.up.railway.app`)
   - **Scope**: Production, Preview, Development

### Step 2: Redeploy

After adding the environment variable:
1. Go to Deployments
2. Click on the latest deployment
3. Click "Redeploy" to apply the new environment variable

## Local Development

### Backend

```bash
# Start the backend server
npm run server
# Server will run on http://localhost:3001
```

### Frontend

```bash
# Start the React development server
npm start
# Frontend will run on http://localhost:3000
```

### Environment Variables for Local Development

Create a `.env` file in the project root:
```
REACT_APP_API_URL=http://localhost:3001
```

## Database

The SQLite database (`server/reviews.db`) will be created automatically on first run.

**Note**: Railway provides ephemeral storage, so the database will be reset when the container restarts. For production, consider:
- Using Railway's persistent volumes
- Migrating to PostgreSQL (Railway provides free PostgreSQL databases)
- Using an external database service

## Testing the Deployment

1. Frontend: Visit your Vercel URL
2. Upload an Excel file with meeting data
3. Click "Share for Director Review"
4. Copy the review URL and open it in a new tab/incognito window
5. Enter a director name and verify you can see the meetings
6. Test approving/rejecting meetings

## Troubleshooting

### "Review Not Found" or "Failed to load"
- Check that `REACT_APP_API_URL` is set correctly in Vercel
- Verify the Railway backend is running (check Railway logs)
- Ensure the backend URL doesn't have a trailing slash

### CORS Errors
- The backend already has CORS enabled for all origins
- If issues persist, check Railway logs for errors

### Database Issues
- Railway's ephemeral storage means data is lost on redeploy
- Consider migrating to PostgreSQL for production use
