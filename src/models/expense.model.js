import mongoose, { Schema } from "mongoose";

const expenseSchema = new Schema(
  {
    amount: {
      type: Schema.Types.Decimal128, // precise for money
      required: true
    },
    currency: {
      type: String,
      required: true,
      uppercase: true, 
      trim: true
    },
    conversionRate:{
      type : Schema.Types.Decimal128,
      default:null
    },
    convertedRate:{
      type:String,
      default:null
    },
    title:{
     type:String,
     required:true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default:null
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default:null
    },
    createdBy:{
      type:Schema.Types.ObjectId,
      ref:"User",
      default:null
    }
  },
  { timestamps: true }
);

export const Expense = mongoose.model("Expense", expenseSchema);
