import { Category } from "../models/category.model.js";

const generalCategories = [
  { name: "uncategorised", image: "https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif" },
  { name: "food", image: "https://res.cloudinary.com/doth3mn81/image/upload/v1759500782/food_l5blw5.jpg" },
  { name: "transport", image: "https://res.cloudinary.com/doth3mn81/image/upload/v1759500781/transport_nlme1p.jpg" },
  { name: "utilities", image: "https://res.cloudinary.com/doth3mn81/image/upload/v1759500774/utility_xur5ea.jpg" },
  { name: "work & business", image: "https://res.cloudinary.com/doth3mn81/image/upload/v1752161841/samples/balloons.jpg" }
];

export const seedCategories = async () => {
  for (const cat of generalCategories) {
    const exists = await Category.exists({ name: cat.name, userId: null });
    if (!exists) {
      await Category.create({ ...cat, userId: null, orgId: null, isGeneral :true });
      console.log(`Created category: ${cat.name}`);
    } else {
      console.log(`Skipped existing category: ${cat.name}`);
    }
  }
};
