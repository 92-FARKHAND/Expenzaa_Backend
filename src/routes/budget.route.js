import { Router } from "express";
import verifyJWT from "../middlewares/auth.middleware.js";

import {
    getUserBudget,
    editBudget
} from "../controllers/budget.controller.js"

const router = Router();

router.route("/detail").get(verifyJWT,getUserBudget)
router.route("/edit").patch(verifyJWT,editBudget)


export default router;