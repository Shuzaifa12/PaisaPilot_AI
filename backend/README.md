# PaisaPilot AI — cash-flow forecast backend

Deterministic FastAPI service that projects cash balances from a current balance, a reserve target, and dated income/expense items you supply.

This backend is independent of the Meterless TypeScript starter in the repository root. It does **not** connect to a bank, move money, or call sponsor APIs.

Projections are **estimates, not guarantees**. The service never invents transactions, dates, amounts, or financial evidence.

## What it calculates

Given `current_cash_balance`, `reserve_target`, `as_of_date`, income, and expenses, `POST /forecast` returns:

- Daily projected balances for 7, 14, and 30 days (end of each calendar day)
- Projected balance after each dated event that is included in the forecast
- First date the projected balance falls below `reserve_target` (within each horizon)
- Reserve gap: `max(0, reserve_target - projected_balance)`
- Evidence listing which transaction IDs were used or excluded

Income statuses:

- `confirmed` and `scheduled` are included in the conservative forecast
- `uncertain` is excluded by default (`include_uncertain_income: false`)

Same-day rule: expenses are applied before income, then by transaction id. Events dated before `as_of_date` are excluded and reported in evidence.

## Setup

Python 3.11+ is required.

From this `backend/` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

On macOS or Linux:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

No API keys are required.

## Run the API

```powershell
uvicorn app.main:app --reload --app-dir .
```

- Health: `GET http://127.0.0.1:8000/health`
- Forecast: `POST http://127.0.0.1:8000/forecast`
- OpenAPI docs: `http://127.0.0.1:8000/docs`

Example body:

```json
{
  "current_cash_balance": "1000.00",
  "reserve_target": "400.00",
  "as_of_date": "2026-10-21",
  "include_uncertain_income": false,
  "income": [
    {
      "id": "inc-1",
      "amount": "500.00",
      "expected_date": "2026-10-25",
      "status": "confirmed"
    }
  ],
  "expenses": [
    {
      "id": "exp-1",
      "amount": "800.00",
      "due_date": "2026-10-23",
      "description": "Rent"
    }
  ]
}
```

Amounts must be greater than 0 with at most two decimal places. `current_cash_balance` and `reserve_target` must be greater than or equal to 0.

## Run tests

```powershell
pytest
```

Expected coverage includes a normal forecast, missing fields, invalid amounts, a reserve breach from expenses, and uncertain-income handling.
