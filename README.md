# SafeRouteDC

SafeRouteDC assigns each route a **safety score from 0–100**, The score is computed using nearby crime data and accounts for proximity, severity, and recency of incidents.


## Safety Scoring Model (Overview)

The safety score is based on the following factors:

- **Proximity** — crimes within ~0.18 km of the route  
- **Severity** — more serious crimes contribute higher risk  
- **Recency** — recent incidents weigh more than older ones  
- **Route Length** — scores are normalized per kilometer  

### How it works (intuitively)

1. Crimes near the route are collected  
2. Each crime is weighted by:
   - **Type** (e.g. robbery vs. theft)  
   - **Recency** (newer crimes matter more)  
3. These are combined into a **risk score per kilometer**  
4. The final safety score is computed using exponential decay  


**Result:**
- Safer routes remain close to **100**
- High-risk routes decrease rapidly  

 **Full technical details:** 
 [SafetyScore.pdf](https://github.com/user-attachments/files/26521052/SafetyScore.pdf)


## Tech Stack

- **Frontend:** Vanilla JavaScript  
- **Backend:** Node.js / Express  
- **Database:** : MSSQL  
- **APIs:** Google Maps API  


## Getting Started

### Prerequisites

- Node.js (v18+)  
- Google Maps API key  

### Installation

```bash
git clone https://github.com/yourusername/saferoutedc.git
cd saferoutedc
npm install
npm start
```
Then open your browser and navigate to:
http://localhost:4000

## How to Use
1. Enter a start location
2. Enter a destination
3. View multiple route options on the map
4. Each route displays a safety score (0–100)
5. Choose the route that balances safety and travel time

⚠️ Notes
The model is based on heuristic weighting and historical data.
Future improvements include real-time data integration and learned weighting models.
