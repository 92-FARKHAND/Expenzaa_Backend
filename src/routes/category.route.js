import Router from "express"
import {upload} from "../middlewares/multer.middleware.js"
import verifyJWT from "../middlewares/auth.middleware.js";
import { attachContext, requireRole } from "../middlewares/atttachRole.middleware.js"
import {
  createCategory,
  getCategories,
  deleteCategory
} from "../controllers/category.controller.js"
const router = Router();


router.use(verifyJWT); // All routes below this statement are protected
router.use(attachContext)
router.route("/create-category").post(
    upload.single("image"),
    requireRole(["admin", "manager"]),
    createCategory
)
router.route("/categories").get(getCategories)
router.route("/:categoryId").delete(requireRole(["admin", "manager"]),deleteCategory)
export default router;