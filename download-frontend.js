require("dotenv").config();

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { ZIP_URL, ZIP_AUTH_TOKEN } = require("./config/serverConfig");

const OUTPUT_ZIP_PATH = path.join(__dirname, "downloaded.zip");
const EXTRACT_DIR = path.join(__dirname, "public");

async function downloadAndExtractZip() {
  try {
    console.log("Downloading ZIP file...");

    // Fetch the ZIP file with authorization header
    const response = await fetch(ZIP_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ZIP_AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.statusText}`);
    }

    // Read the response as a buffer
    const buffer = await response.arrayBuffer();

    // Write the ZIP file to disk
    fs.writeFileSync(OUTPUT_ZIP_PATH, Buffer.from(buffer));
    console.log("ZIP file downloaded successfully:", OUTPUT_ZIP_PATH);

    // Extract the ZIP file
    console.log("Extracting ZIP file...");
    const zip = new AdmZip(OUTPUT_ZIP_PATH);
    zip.extractAllTo(EXTRACT_DIR, true);
    console.log("ZIP file extracted to:", EXTRACT_DIR);

    // Optional: Delete the ZIP file after extraction
    fs.unlinkSync(OUTPUT_ZIP_PATH);
    console.log("Temporary ZIP file deleted.");
  } catch (error) {
    console.error("Error downloading or extracting ZIP:", error.message);
  }
}

module.exports = downloadAndExtractZip;
