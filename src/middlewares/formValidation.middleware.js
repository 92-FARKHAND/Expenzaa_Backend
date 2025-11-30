import {body, validationResult} from "express-validator"


const registerValidation = [
    body("username")
     .notEmpty().withMessage("Username is required")
     .isLength({min:4,max:25}).withMessage("Username must be 4 to 25 characters"),
    body("fullName")
     .notEmpty().withMessage("Fullname is required")
     .isLength({min:4,max:25}).withMessage("Fullname must be 4 to 25 characters"),
    body("email")
     .notEmpty().withMessage("Email is required")
     .isEmail()
     .withMessage("Invalid email Format"),
    body("password")
      .notEmpty().withMessage("Password is required")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long")
      .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
      .matches(/[0-9]/).withMessage("Password must contain at least one number")

];

export {registerValidation};