const dotenv = require("dotenv"); // imports client ID from .env file
dotenv.config();
console.log("SERVER.JS FILE LOADED");

const express = require('express');
const app = express();
console.log("REGISTERING ROUTES...");
const PORT = process.env.PORT || 3000;
const axios = require("axios");

// Redirects user to WHOOP authorization page
app.get('/auth/whoop', (req, res) => {
  const clientId = process.env.WHOOP_CLIENT_ID; // Use environment variable
  const redirectUri = process.env.WHOOP_REDIRECT_URI;
  const scope = "read:recovery read:workout read:profile read:cycles";
  
  const authUrl =
  `https://api.prod.whoop.com/oauth/oauth2/auth` +
  `?client_id=${clientId}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(scope)}` +
  `&state=oijdoins`;

  res.redirect(authUrl);
});


// Home route, initial when you click the link
app.get('/', (req, res) => {
  res.send('Hello Whoop Week in Review!');
});

//Whoop OAuth redirect route, sign into whoop account
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send("No authorization code received.");
  }

  try {
    // Exchange code for token
    const tokenResponse = await axios.post(
      "https://api.prod.whoop.com/oauth/oauth2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET,
        redirect_uri: process.env.WHOOP_REDIRECT_URI
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log("ACCESS TOKEN:", accessToken);

    // Call WHOOP API
    const profileResponse = await axios.get(
      "https://api.prod.whoop.com/developer/v1/user/profile/basic",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log("PROFILE DATA:", profileResponse.data); 
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    const start = sevenDaysAgo.toISOString();
    const end = today.toISOString();
  //RECOVERY DATA BEING PULLED
  const recoveryResponse = await axios.get(
    "https://api.prod.whoop.com/developer/v2/recovery",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { start, end }
    }
  );
  //console.dir(recoveryResponse.data.records, { depth: null }); //use line for full version of scores
  //console.log("RECOVERY DATA: ", recoveryResponse.data); //use line for collapsed version of scores

  //STRAIN BEING PULLED
  const cycleResponse = await axios.get(
    "https://api.prod.whoop.com/developer/v2/cycle",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { start, end }
    }
  );
    //console.dir(cycleResponse.data.records, { depth: null }); //use line for full version of scores
    //console.log("CYCLE DATA:", cycleResponse.data); //use line for collapsed version of scores

    const recoveries = recoveryResponse.data.records;
    const cycles = cycleResponse.data.records;
    const completedCycles = cycles.filter(cycle => cycle.end !== null);

//DEBUG OUTPUTS
    console.log("TOTAL CYCLES:", cycles.length);
    console.log("COMPLETED CYCLES:", completedCycles.length);
    console.log("TOTAL RECOVERIES:", recoveries.length);

    const recoveryMap = new Map(); //creates a more efficient way to track and find data

recoveries.forEach(recovery => {
  recoveryMap.set(recovery.cycle_id, recovery);
});

function calculateStrainTargets(recoveryScore) {
  //CHANGE THIS IF EQUATION CHANGES
  const min = 5.29675 * Math.pow(1.01047, recoveryScore);
  const max = 8.26458 * Math.pow(1.0089, recoveryScore);

  return {
    min: Number(min.toFixed(1)),
    max: Number(max.toFixed(1))
  };
}
//Puts it all together into the weekly summary
const weeklySummary = completedCycles.map(cycle => {

  const recovery = recoveryMap.get(cycle.id);

  if (!recovery) return null;
  const recoveryScore = recovery.score?.recovery_score;
  const actualStrain = cycle.score?.strain;
  const { min, max } = calculateStrainTargets(recoveryScore);
  

  let status;

  if (actualStrain > max) {
    status = "over";
  } else if (actualStrain < min) {
    status = "under";
  } else {
    status = "in-zone";
  }

  return {
    date: cycle.start.split("T")[0],
    strain: actualStrain,
    min,
    max,
    status
  };

}).filter(day => day !== null);

console.log("WEEKLY SUMMARY:");
console.dir(weeklySummary, { depth: null });

res.json(weeklySummary);
    

  } catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
    res.send("Something went wrong. Check terminal.");
  }
});
//Whoop OAuth redirect route
app.get('/webhook', (req, res) => {

});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});