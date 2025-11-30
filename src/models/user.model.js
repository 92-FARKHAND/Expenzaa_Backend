import { mongoose,Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
const userSchema = new Schema({
    username:{
        type:String,
        required:true,
        lowercase:true,
        unique:true,
        trim:true
      },
      role:{
        type:String,
        enum:['solo','admin','member'],
        default:'solo',
        lowercase:true,
        required:true
      },
      planType:{
       type:String,
       enum:['free','pro'],
       default:'free'
      },
      fullName:{
        type:String,
        required:true,
        uppercase:true,
        trim:true
      },
      email:{
        type:String,
        required:true,
        lowercase:true,
        unique:true,
        trim:true
      },
      avatar:{
        type:String,
        default:'https://res.cloudinary.com/doth3mn81/image/upload/v1759509290/avatar_khahqh.jpg'
      },
      password:{
        type:String,
        required:true
      },
      refreshToken:{
        type:String,
      }
},{timestamps:true});

userSchema.pre("save",async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password,10) 
  }
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password,this.password);
};

userSchema.methods.generateRefreshToken=  function(){
  return jwt.sign(
    {
      _id:this._id
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn:process.env.REFRESH_TOKEN_EXPIRY
    }
  )
}
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
   {
     _id:this._id
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn:process.env.ACCESS_TOKEN_EXPIRY
    }
  )
};

export const User = mongoose.model("User",userSchema);