# Parkwise Parking Management

A local-first parking operations dashboard with a FastAPI + SQLite API and a React/Vite frontend.

## Requirements

- Python 3.11+
- Node.js 20+

## Run locally

### API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`; interactive API docs are at `/docs`. The SQLite database (`backend/parking.db`) and its initial spots are created automatically. Parking spots, active tickets, and completed checkout records persist across API restarts. Back up this database file to retain records.

### Web app

```powershell
cd frontend
npm install
npm run dev
```

The development server proxies `/api` requests to the local API. Set `VITE_API_URL` to override the API origin when deploying. In the parking overview, filter slots by All, Available, or Occupied, or search by slot number or vehicle number. Checking out an occupied vehicle requires an accessible confirmation before its spot is released. Ticket billing is calculated in Indian Rupees (₹), and administrators can customize hourly rates for standard, EV, and accessible vehicles directly from the dashboard. All operational actions—check-ins, checkouts, spot additions, and rate changes—are recorded in a persistent transaction audit log with search and activity filters.

## Quality checks

```powershell
cd backend
python -m unittest discover -s tests -v
cd ..\frontend
npm run build
```

## Accessibility

Use the navigation controls to select a text size, high-contrast palette, or dark theme. Preferences and the checkout search text are saved locally in the browser; ticket results and receipts are not. A successful checkout clears the saved search text. `Alt+H`, `Alt+D`, `Alt+N`, and `Alt+S` toggle high contrast, dark mode, open check-in, and focus search. All actions are keyboard operable and status updates are announced.
