import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import app from "./app.js";
import { seedCategories } from "./seed/seedCategory.js";
import { connectDB, DB_NAME } from "./db/index.js";

console.log(`Connecting to DB: ${DB_NAME}`);

connectDB()
  .then(async () => {
    // Seed only if env variable is set
    if (process.env.SEED_CATEGORIES === "true") {
      await seedCategories();
      console.log("Categories seeding completed");
    }

    app.on("error", (error) => {
      console.error("App error:", error);
    });

    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
      console.log(`Server is running at: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error);
  });
