import { mongoose,Schema } from "mongoose";

const organizationSchema = new Schema({
    name:{
        type:String,
        required: true,
        lowercase:true,
        trim:true
    },
    description:{
        type:String,
        required: true,
        lowercase:true,
        trim:true 
    },
    adminId:{
        type:Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamps:true});

export const Organization = mongoose.model("Organization",organizationSchema)