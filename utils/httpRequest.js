const { ONLINE_EXAM_API_URL, JWT_SECRET } = require("../config/serverConfig");

const httpRequest = async function (
  requestRoute,
  requestMethod,
  requestData,
  requestHeader = {}
) {
  requestHeader = JSON.parse(JSON.stringify(requestHeader));
  delete requestHeader["connection"];
  delete requestHeader["host"];
  delete requestHeader["origin"];
  delete requestHeader["referer"];
  delete requestHeader["content-length"];

  try {
    const response = await fetch(`${ONLINE_EXAM_API_URL}${requestRoute}`, {
      method: requestMethod,
      headers: { "Content-Type": "application/json", ...requestHeader },
      ...(requestData && { body: JSON.stringify(requestData) }),
    });

    if (!response.ok) {
      // The server responded, but with an error status (e.g., 400, 401, 500)

      if ([400, 401, 402, 403].includes(response.status)) {
        return response;
      }

      throw new Error(`Server Error (${response.status}):`);
    }

    return response;
  } catch (error) {
    if (error.name === "FetchError") {
      throw new Error("Network error: Unable to reach the server.");
    }
    throw new Error(`Request failed: ${error.message}`);
  }
};

module.exports = httpRequest;
