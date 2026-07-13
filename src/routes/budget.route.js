import { Router } from "express";
import verifyJWT from "../middlewares/auth.middleware.js";
import { attachContext, requireRole } from "../middlewares/atttachRole.middleware.js";

import {
    getBudget,
    editBudget
} from "../controllers/budget.controller.js"

const router = Router();

router.use(verifyJWT);
router.use(attachContext);

router.route("/detail").get(getBudget)
router.route("/edit").patch(requireRole(["admin","manager"]),editBudget)


export default router;