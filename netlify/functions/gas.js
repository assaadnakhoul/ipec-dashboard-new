// netlify/functions/gas.js
exports.handler = async () => {
  try {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbywz_pa45tfEIgDH3rjHFr_pcXfGtgfAXjj960lVTmovF_u96B5p8a7XLqhHIjwdK70WA/exec";
    const r = await fetch(GAS_URL, { redirect: "follow" });
    const text = await r.text(); // GAS returns JSON text
    return {
      statusCode: r.ok ? 200 : r.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
