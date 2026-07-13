import {v2 as cloudinary} from "cloudinary"
import sharp from "sharp"
import { ApiError } from "./apiError.js"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});





const uploadOnCloudinary = async (fileBuffer) => {
try {
      if (!fileBuffer) {
         throw new ApiError(400,"File is not Found");
        }
        
        const compressedBuffer = await sharp(fileBuffer)
        .resize(600,600,{fit:"inside"})
        .jpeg({quality: 70})
        .toBuffer()
        
     const response = await new Promise((resolve,reject)=>{
        cloudinary.uploader.upload_stream(
        {
         resource_type:"image",
         folder  : "uploads"
        },
        (err,res)=>{
        if (err) {
          console.error("Cloudinary stream error:", err);
          reject(err);
        } else {
          resolve(res);
  }
        })
        .end(compressedBuffer);
    })
        return response;
    } catch (error) {
        console.log("Cloudinary upload error", error);
        return null;
    }
}
export {uploadOnCloudinary};
