import {mongoose, Schema} from 'mongoose'

const membershipSchema = new Schema({
    userId : {
        type:Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orgId : {
        type:Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    role:{
       type : String,
       enum:["Admin","Member"],
       default:"Member",
       required: true
    }
},{timestamps:true});

export const Membership = mongoose.model("Membership",membershipSchema);