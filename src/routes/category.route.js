import Router from "express"
import {upload} from "../middlewares/multer.middleware.js"
import verifyJWT from "../middlewares/auth.middleware.js";
import {
    createCategory,
    getUserCategories,
    deleteCategory
} from "../controllers/category.controller.js"
const router = Router();

router.route("/create-category").post(
    verifyJWT,
    upload.single("image"),
    createCategory
)
router.route("/categories").get(verifyJWT,getUserCategories)
router.route("/:categoryId").delete(verifyJWT,deleteCategory)
export default router;