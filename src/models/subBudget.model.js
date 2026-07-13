import mongoose, { Schema } from "mongoose";

const subBudgetSchema = new Schema(
  {
    allocatedAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: 0,
    },
    spentAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: 0,
    },
    remainingAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: "PKR",
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    budgetId: {
      type: Schema.Types.ObjectId,
      ref: "Budget",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default:null
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default:null
    }
  },
  { timestamps: true }
);

// ✅ Auto-calculate remaining amount before saving
subBudgetSchema.pre("save", function (next) {
  const allocated = parseFloat(this.allocatedAmount?.toString() || 0);
  const spent = parseFloat(this.spentAmount?.toString() || 0);
  this.remainingAmount = allocated - spent;
  next();
});

// ✅ Compound unique index to avoid duplicate subbudgets per user/category
// subbudgetSchema.index({ userId: 1, categoryId: 1 }, { unique: true });

//partial index that make sures uniqness int bot user and org case
subBudgetSchema.index(
  { userId: 1, categoryId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      userId: { $exists: true, $ne: null }
    }
  }
);

subBudgetSchema.index(
  { orgId: 1, categoryId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      orgId: { $exists: true, $ne: null }
    }
  }
);


export const SubBudget = mongoose.model("SubBudget", subBudgetSchema);
