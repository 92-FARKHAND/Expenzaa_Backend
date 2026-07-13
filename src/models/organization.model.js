import mongoose, { Schema } from "mongoose";

const organizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    location:{
      type:String,
      trim:true
    },
    website:{
      type:String,
      trim:true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    memberCount:{
     type : Schema.Types.Decimal128
    }
  },
  { timestamps: true }
);

// Optional: prevent duplicate org names per creator
organizationSchema.index({ name: 1, createdBy: 1 }, { unique: true });

export const Organization = mongoose.model(
  "Organization",
  organizationSchema
);
