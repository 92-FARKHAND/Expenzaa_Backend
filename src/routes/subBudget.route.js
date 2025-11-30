import { Router } from "express";
import verifyJWT from "../middlewares/auth.middleware.js";
import {validateAndDeductBudget} from "../middlewares/budgetCheck.middleware.js"
import {
    setSubBudget,
    getSubBudget
} from "../controllers/subBudget.controller.js"

const router = Router();

router.route("/setSubBudget/:categoryId").patch(verifyJWT,setSubBudget)
router.route("/getSubBudget/:categoryId").get(verifyJWT,getSubBudget)

export default router;