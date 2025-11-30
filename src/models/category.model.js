import { mongoose,Schema } from "mongoose";

const categorySchema = new Schema({
    name :{
        type:String,
        required:true,
        lowercase:true,
        trim:true
    },
    image :{
        type:String,
        default:"https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif",
        trim:true
    },
    orgId:{
        type:Schema.Types.ObjectId,
        ref:"Organization"
    },
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User"
    },
    isGeneral:{
        type:Boolean,
        default:false,
        required:true
    }
},{timestamps:true});
categorySchema.index(
  { name: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isGeneral: false }
  }
);

export const Category = mongoose.model("Category",categorySchema)