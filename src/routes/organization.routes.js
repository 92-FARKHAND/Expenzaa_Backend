import { Router } from "express";
import  verifyJWT  from "../middlewares/auth.middleware.js";
import { attachContext, requireRole } from "../middlewares/atttachRole.middleware.js";
import {
 createOrganization,
 getOrganizationDetails,
 getUserOrganizations,
 updatedOrganization,
 deleteOrganization,
 inviteMember,
 acceptInvitation,
 rejectInvitation,
 removeMember,
 updateMemberRole,
 getOrganizationMembers
} from "../controllers/organization.controller.js";

const router = Router();
router.use(verifyJWT);
router.use(attachContext);

router.route("/create").post(createOrganization);
router.route("/getDetails/:organizationId").get(getOrganizationDetails);
router.route("/getUserOrgs").get(getUserOrganizations);
router.use(requireRole(["admin"]))
router.route("/updateOrg/:organizationId").patch(updatedOrganization);  
router.route("/delete/:organizationId").delete(deleteOrganization);   
router.route("/invite/:organizationId").post(inviteMember); 
router.route("/accept/:organizationId").post(acceptInvitation);
router.route("/reject/:organizationId").post(rejectInvitation);
router.route("/:organizationId/remMembers/:memberId").post(removeMember);
router.route("/:organizationId/updMember/:memberId").post(updateMemberRole);
router.route("/:organizationId/members").get(getOrganizationMembers);

export default router;