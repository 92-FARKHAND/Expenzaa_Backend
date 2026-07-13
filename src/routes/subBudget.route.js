import { Router } from "express";
import verifyJWT from "../middlewares/auth.middleware.js";
import {validateAndDeductMainBudget} from "../middlewares/mainBudget.middleware.js"
import {
    setSubBudget,
    getAllSubBudgets
} from "../controllers/subBudget.controller.js"
import { attachContext,requireRole } from "../middlewares/atttachRole.middleware.js";


const router = Router();

router.use(verifyJWT);
router.use(attachContext);
router.route("/setSubBudget/:categoryId").patch(requireRole(["admin","manager"]),setSubBudget) //checked
router.route("/getAllSubBudget").get(getAllSubBudgets) //checked

export default router;