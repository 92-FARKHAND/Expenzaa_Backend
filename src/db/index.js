import mongoose from "mongoose"
const DB_NAME = "expenseTracker";

const connectDB = async()=>{
    try {
        const connectionInstance = await mongoose.connect(
            `${process.env.DB_URI}/${DB_NAME}`
        );
        console.log(`\n✅ MongoDB connected: ${connectionInstance.connection.host}`);
        
    } catch (error) {
        console.error("❌ MONGODB connection FAILED", error);
        process.exit(1);
    }
};
export  {connectDB,DB_NAME};