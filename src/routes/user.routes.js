import{Router} from "express"
import {upload} from "../middlewares/multer.middleware.js"
import { registerValidation } from "../middlewares/formValidation.middleware.js";
import {
     registerUser,
     logIn,
     logOut,
     getUserProfile,
     changePassword,
     updateUserProfile,
     updateAvatar,
     deleteUser,
     switchContext
     } from "../controllers/user.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";


const router = Router();
router.route("/register").post(
    upload.single("avatar"),
    registerValidation,
    registerUser
)
router.route("/login").post(logIn)

//secure routes
router.route("/logout").post(verifyJWT,logOut)
router.route("/profile").get(verifyJWT,getUserProfile)
router.route("/change-password").patch(verifyJWT,changePassword)
router.route("/update-profile").patch(verifyJWT,updateUserProfile)
router.route("/update-avatar").patch(verifyJWT, upload.single("avatar") ,updateAvatar)
router.route("/delete-account").delete(verifyJWT,deleteUser)
router.route("/switch-context").post(verifyJWT,switchContext)


export default router;