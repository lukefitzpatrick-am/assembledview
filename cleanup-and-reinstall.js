const { execSync } = require("child_process")

console.log("Cleaning up and reinstalling dependencies...")

try {
  // Remove node_modules and package-lock.json
  execSync("rm -rf node_modules package-lock.json", { stdio: "inherit" })
  console.log("Removed node_modules and package-lock.json")

  // Install dependencies using npm
  execSync("npm install", { stdio: "inherit" })
  console.log("Dependencies reinstalled successfully")
} catch (error) {
  console.error("Error during cleanup and reinstall:", error.message)
}

