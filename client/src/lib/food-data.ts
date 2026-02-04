/**
 * Food Data — SPAR Nutrition + Sugar System
 *
 * SPAR foods sourced from "Simple As Pie" PDF (pages 10-11).
 * Sugar System foods sourced from "FGF21_Sugar_System_FINAL_13" PDF (pages 17-18).
 */

// ─── SPAR FOOD TYPES ───

export interface SparFood {
  name: string;
  serving: string;
  calories: number;
  protein?: number;   // grams (for protein items)
  carbs?: number;     // grams (for carb items)
  icon: string;
  oz?: number;        // liquid oz (juices count toward water intake)
}

export const SPAR_FOODS = {
  protein: [
    { name: 'Chicken Breast', serving: '1 palm (~4oz)', calories: 120, protein: 26, icon: '🍗' },
    { name: 'Clams', serving: '1 palm', calories: 125, protein: 22, icon: '🦪' },
    { name: 'Crab', serving: '1 palm', calories: 100, protein: 20, icon: '🦀' },
    { name: 'Eggs (2 = 1 serv.)', serving: '2 whole eggs', calories: 140, protein: 12, icon: '🥚' },
    { name: 'Fish', serving: '1 palm', calories: 110, protein: 22, icon: '🐟' },
    { name: 'Ground Beef', serving: '1 palm', calories: 150, protein: 24, icon: '🥩' },
    { name: 'Ground Turkey', serving: '1 palm', calories: 130, protein: 22, icon: '🦃' },
    { name: 'Lean Steak', serving: '1 palm', calories: 150, protein: 26, icon: '🥩' },
    { name: 'Pork', serving: '1 palm', calories: 140, protein: 22, icon: '🥓' },
    { name: 'Scallops', serving: '1 palm', calories: 95, protein: 20, icon: '🦪' },
    { name: 'Shrimp', serving: '1 palm', calories: 100, protein: 24, icon: '🦐' },
    { name: 'Turkey Breast', serving: '1 palm', calories: 130, protein: 22, icon: '🦃' },
    { name: 'Non-Fat Greek Yogurt', serving: '1 cup', calories: 130, protein: 22, icon: '🥛' },
    { name: 'Skim Milk (8oz)', serving: '8 oz', calories: 80, protein: 8, icon: '🥛' },
    { name: 'Whey (1 scp. = 2 serv.)', serving: '1 scoop', calories: 120, protein: 25, icon: '🥤' },
    { name: 'Casein (1 scp. = 2 serv.)', serving: '1 scoop', calories: 120, protein: 24, icon: '🥤' },
  ] as SparFood[],

  carb: [
    { name: 'Acorn Squash', serving: '1 fist', calories: 60, carbs: 15, icon: '🎃' },
    { name: 'Beans (Any)', serving: '1 fist', calories: 115, carbs: 20, icon: '🫘' },
    { name: 'Brown Rice', serving: '1 fist (~½ cup)', calories: 110, carbs: 23, icon: '🍚' },
    { name: 'Butternut Squash', serving: '1 fist', calories: 65, carbs: 16, icon: '🎃' },
    { name: 'Oatmeal', serving: '½ cup dry', calories: 150, carbs: 27, icon: '🥣' },
    { name: 'Purple Potato', serving: '1 fist', calories: 110, carbs: 26, icon: '🥔' },
    { name: 'Quinoa', serving: '1 fist cooked', calories: 110, carbs: 20, icon: '🌾' },
    { name: 'Spaghetti Squash', serving: '1 fist', calories: 40, carbs: 10, icon: '🎃' },
    { name: 'Sprouted Bread (1)', serving: '1 slice', calories: 80, carbs: 15, icon: '🍞' },
    { name: 'Sweet Potato', serving: '1 fist', calories: 115, carbs: 27, icon: '🍠' },
    { name: 'Wild Rice', serving: '1 fist cooked', calories: 100, carbs: 21, icon: '🍚' },
    { name: 'Yukon Gold Potato', serving: '1 fist', calories: 110, carbs: 26, icon: '🥔' },
  ] as SparFood[],

  veg: [
    // Vegetables only (fruit moved to separate category for v2)
    { name: 'Asparagus', serving: '1 fist', calories: 25, icon: '🌿' },
    { name: 'Bell Peppers', serving: '1 fist', calories: 25, icon: '🫑' },
    { name: 'Broccoli', serving: '1 fist', calories: 30, icon: '🥦' },
    { name: 'Brussel Sprouts', serving: '1 fist', calories: 40, icon: '🥬' },
    { name: 'Carrots', serving: '1 fist', calories: 40, icon: '🥕' },
    { name: 'Cauliflower', serving: '1 fist', calories: 25, icon: '🥦' },
    { name: 'Celery', serving: '1 fist', calories: 10, icon: '🥒' },
    { name: 'Cucumber', serving: '1 fist', calories: 15, icon: '🥒' },
    { name: 'Dark Leafy Lettuce', serving: '2 fists raw', calories: 10, icon: '🥬' },
    { name: 'Green Beans', serving: '1 fist', calories: 30, icon: '🫛' },
    { name: 'Kale', serving: '1 fist', calories: 35, icon: '🥬' },
    { name: 'Mixed Greens', serving: '2 fists raw', calories: 10, icon: '🥗' },
    { name: 'Onions', serving: '1 fist', calories: 40, icon: '🧅' },
    { name: 'Peas', serving: '1 fist', calories: 60, icon: '🫛' },
    { name: 'Spinach', serving: '2 fists raw', calories: 15, icon: '🥬' },
    { name: 'Tomatoes', serving: '1 fist', calories: 25, icon: '🍅' },
    { name: 'Watercress', serving: '2 fists raw', calories: 5, icon: '🥬' },
    { name: 'Zucchini', serving: '1 fist', calories: 20, icon: '🥒' },
  ] as SparFood[],

  // v2: Fruit is now a separate category
  fruit: [
    { name: 'Apple', serving: '1 medium', calories: 95, icon: '🍎' },
    { name: 'Banana', serving: '1 medium', calories: 105, icon: '🍌' },
    { name: 'Berries (Any)', serving: '1 cup', calories: 50, icon: '🫐' },
    { name: 'Cantaloupe', serving: '1 cup cubed', calories: 55, icon: '🍈' },
    { name: 'Cherries', serving: '1 cup', calories: 50, icon: '🍒' },
    { name: 'Grapefruit', serving: '½ medium', calories: 40, icon: '🍊' },
    { name: 'Grapes', serving: '1 cup', calories: 60, icon: '🍇' },
    { name: 'Honeydew', serving: '1 cup cubed', calories: 45, icon: '🍈' },
    { name: 'Kiwi', serving: '1 medium', calories: 45, icon: '🥝' },
    { name: 'Mango', serving: '1 cup', calories: 100, icon: '🥭' },
    { name: 'Nectarine', serving: '1 medium', calories: 60, icon: '🍑' },
    { name: 'Orange', serving: '1 medium', calories: 65, icon: '🍊' },
    { name: 'Peach', serving: '1 medium', calories: 60, icon: '🍑' },
    { name: 'Pear', serving: '1 medium', calories: 100, icon: '🍐' },
    { name: 'Pineapple', serving: '1 cup', calories: 55, icon: '🍍' },
    { name: 'Plum', serving: '1 medium', calories: 30, icon: '🟣' },
    { name: 'Strawberries', serving: '1 cup', calories: 50, icon: '🍓' },
    { name: 'Watermelon', serving: '1 cup cubed', calories: 45, icon: '🍉' },
  ] as SparFood[],

  // v2: Healthy fats category
  fat: [
    { name: 'Almonds', serving: '1 thumb (~14g)', calories: 80, icon: '🥜' },
    { name: 'Avocado', serving: '1 thumb slice', calories: 50, icon: '🥑' },
    { name: 'Butter', serving: '1 thumb (~14g)', calories: 100, icon: '🧈' },
    { name: 'Cashews', serving: '1 thumb (~14g)', calories: 80, icon: '🥜' },
    { name: 'Cheese (hard)', serving: '1 thumb slice', calories: 110, icon: '🧀' },
    { name: 'Coconut Oil', serving: '1 thumb (~14g)', calories: 120, icon: '🥥' },
    { name: 'Dark Chocolate', serving: '1 thumb piece', calories: 80, icon: '🍫' },
    { name: 'Egg Yolk', serving: '2 yolks', calories: 110, icon: '🥚' },
    { name: 'Flax Seeds', serving: '1 Tbsp', calories: 55, icon: '🌱' },
    { name: 'Ghee', serving: '1 thumb (~14g)', calories: 120, icon: '🧈' },
    { name: 'Macadamia Nuts', serving: '1 thumb (~14g)', calories: 100, icon: '🥜' },
    { name: 'Olive Oil', serving: '1 thumb (~14g)', calories: 120, icon: '🫒' },
    { name: 'Peanut Butter', serving: '1 Tbsp', calories: 95, icon: '🥜' },
    { name: 'Pecans', serving: '1 thumb (~14g)', calories: 100, icon: '🥜' },
    { name: 'Pumpkin Seeds', serving: '1 Tbsp', calories: 45, icon: '🎃' },
    { name: 'Sunflower Seeds', serving: '1 Tbsp', calories: 50, icon: '🌻' },
    { name: 'Walnuts', serving: '1 thumb (~14g)', calories: 90, icon: '🥜' },
  ] as SparFood[],
};

// ─── SUGAR SYSTEM FOOD TYPES ───

export interface SugarCarbFood {
  name: string;
  ratio: string;        // fructose:glucose ratio
  serving: string;
  carbs: number;
  oz?: number;          // for liquids
  note?: string;
  timing?: string;
}

export interface SugarProteinFood {
  name: string;
  serving: string;
  protein: number;
  note?: string;
  timing?: string;
}

export interface AvoidFood {
  name: string;
  reason: string;
}

export interface RecoveryFood {
  name: string;
  ratio: string;
  serving: string;
  carbs: number;
  note?: string;
}

export interface TournamentFood {
  name: string;
  ratio: string;
  serving: string;
  carbs: number;
  timing?: string;
}

export interface Supplement {
  name: string;
  serving: string;
  note?: string;
}

export interface FuelTank {
  name: string;
  loseRate: string;
  replenishRate: string;
  performanceCost: string;
  declinePoint: string;
}

export const SUGAR_FOODS = {
  highFructose: [
    { name: "Agave syrup", ratio: "90:10", serving: "1 Tbsp", carbs: 16, note: "Highest fructose" },
    { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, oz: 8, note: "Fast absorption, no pulp" },
    { name: "Pear juice", ratio: "65:35", serving: "8 oz", carbs: 26, oz: 8, note: "High fructose" },
    { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, oz: 8, note: "Balanced" },
    { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, oz: 8, note: "Vitamin C" },
    { name: "Apples", ratio: "65:35", serving: "1 medium", carbs: 25, note: "Portable" },
    { name: "Pears", ratio: "65:35", serving: "1 medium", carbs: 27, note: "High fructose" },
    { name: "Grapes", ratio: "48:52", serving: "1 cup", carbs: 27, note: "Convenient" },
    { name: "Mango", ratio: "50:50", serving: "1 cup", carbs: 25, note: "Tropical" },
    { name: "Watermelon", ratio: "48:52", serving: "2 cups", carbs: 22, note: "Hydrating" },
    { name: "Bananas", ratio: "50:50", serving: "1 medium", carbs: 27, note: "Energy dense" },
    { name: "Blueberries", ratio: "45:55", serving: "1 cup", carbs: 21, note: "Antioxidants" },
    { name: "Honey", ratio: "50:50", serving: "1 Tbsp", carbs: 17, note: "All phases" },
    { name: "Sugar", ratio: "50:50", serving: "1 Tbsp", carbs: 12, note: "Simple" },
    { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Zero fiber" },
    { name: "Coconut water", ratio: "40:60", serving: "8 oz", carbs: 9, oz: 8, note: "Potassium + electrolytes" },
  ] as SugarCarbFood[],

  highGlucose: [
    { name: "White rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Primary Thu-Fri" },
    { name: "Instant rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Very fast" },
    { name: "Potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 37, note: "Remove skin" },
    { name: "Sweet potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 27, note: "Remove skin" },
    { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Zero fiber" },
    { name: "Cream of rice", ratio: "0:100", serving: "1 cup cooked", carbs: 28, note: "Hot cereal" },
    { name: "Rice Krispies", ratio: "0:100", serving: "1 cup", carbs: 26, note: "With honey/juice" },
    { name: "White bread (<1g fiber)", ratio: "0:100", serving: "2 slices", carbs: 26, note: "Check label" },
    { name: "Sourdough", ratio: "0:100", serving: "2 slices", carbs: 30, note: "Easy digestion" },
    { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, oz: 8, note: "Zero fiber" },
    { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, oz: 8, note: "Zero fiber" },
    { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, oz: 8, note: "Zero fiber" },
    { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Portable" },
    { name: "Maltodextrin", ratio: "0:100", serving: "40g", carbs: 38, note: "Fast glucose, zero fiber" },
  ] as SugarCarbFood[],

  balanced: [
    { name: "White rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Staple" },
    { name: "Honey", ratio: "50:50", serving: "2 Tbsp", carbs: 34, note: "Natural balance" },
    { name: "Ripe banana", ratio: "50:50", serving: "1 medium", carbs: 27, note: "Pre-practice" },
    { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Easy digestion" },
    { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, note: "Vitamin C" },
    { name: "Mango", ratio: "50:50", serving: "1 cup", carbs: 25, note: "Tropical" },
    { name: "Grapes", ratio: "48:52", serving: "1 cup", carbs: 27, note: "Convenient" },
    { name: "Watermelon", ratio: "48:52", serving: "2 cups", carbs: 22, note: "Hydrating" },
    { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Quick energy" },
    { name: "Sugar", ratio: "50:50", serving: "1 Tbsp", carbs: 12, note: "Simple" },
    { name: "Blueberries", ratio: "45:55", serving: "1 cup", carbs: 21, note: "Antioxidants" },
    { name: "Coconut water", ratio: "40:60", serving: "8 oz", carbs: 9, note: "Potassium" },
  ] as SugarCarbFood[],

  zeroFiber: [
    { name: "White rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Primary carb" },
    { name: "Instant rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Very fast" },
    { name: "Potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 37, note: "Remove skin" },
    { name: "Sweet potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 27, note: "Remove skin" },
    { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Zero fiber" },
    { name: "Cream of rice", ratio: "0:100", serving: "1 cup", carbs: 28, note: "Hot cereal" },
    { name: "Rice Krispies", ratio: "0:100", serving: "1 cup", carbs: 26, note: "With honey/juice" },
    { name: "White bread (<1g fiber)", ratio: "0:100", serving: "2 slices", carbs: 26, note: "Check label" },
    { name: "Sourdough", ratio: "0:100", serving: "2 slices", carbs: 30, note: "Easy digestion" },
    { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, oz: 8, note: "Zero fiber" },
    { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, oz: 8, note: "Zero fiber" },
    { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, oz: 8, note: "Zero fiber" },
    { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Portable" },
    { name: "Honey", ratio: "50:50", serving: "2 Tbsp", carbs: 34, note: "Pure sugar" },
    { name: "Dextrose powder", ratio: "0:100", serving: "40g", carbs: 40, note: "No fiber" },
    { name: "Maltodextrin", ratio: "0:100", serving: "40g", carbs: 38, note: "Fast glucose source" },
  ] as SugarCarbFood[],

  protein: [
    { name: "Collagen + 5g leucine", serving: "25-30g", protein: 25, note: "Mon-Fri: Primary, preserves muscle", timing: "Mon-Fri" },
    { name: "Egg whites", serving: "4 whites", protein: 14, note: "Wed-Fri: Low fat, easy digestion", timing: "Wed-Fri" },
    { name: "White fish", serving: "4 oz", protein: 24, note: "Thu-Fri: Ultra lean", timing: "Thu-Fri" },
    { name: "Shrimp", serving: "4 oz", protein: 24, note: "Thu-Fri: Zero fat", timing: "Thu-Fri" },
    { name: "Scallops", serving: "4 oz", protein: 20, note: "Thu-Fri: Zero fat", timing: "Thu-Fri" },
    { name: "Lean seafood", serving: "4 oz", protein: 22, note: "Thu-Fri: Performance phase", timing: "Thu-Fri" },
    { name: "NO protein", serving: "—", protein: 0, note: "Competition day: Until wrestling is over", timing: "Competition" },
    { name: "Whey isolate", serving: "1 scoop", protein: 25, note: "Post-competition: Fast recovery", timing: "Post-comp" },
    { name: "Chicken breast", serving: "4 oz", protein: 26, note: "Post-competition: Lean protein", timing: "Post-comp" },
    { name: "Beef/Bison", serving: "4 oz", protein: 26, note: "Post-competition: Iron + creatine", timing: "Post-comp" },
    { name: "Whole eggs", serving: "3 large", protein: 18, note: "Post-comp & Sunday: Full recovery", timing: "Post-comp/Sun" },
    { name: "Greek yogurt", serving: "1 cup", protein: 17, note: "Sunday: Recovery", timing: "Sunday" },
    { name: "Casein", serving: "1 scoop", protein: 24, note: "Sunday PM: Overnight recovery", timing: "Sunday PM" },
    { name: "Dairy", serving: "varies", protein: 8, note: "Sunday: All allowed", timing: "Sunday" },
    { name: "Plant proteins", serving: "varies", protein: 15, note: "Sunday: Higher fat", timing: "Sunday" },
  ] as SugarProteinFood[],

  avoid: [
    { name: "Whey protein (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Casein protein (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Chicken/Poultry (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Turkey (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Beef (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Pork (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Eggs (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Dairy (Mon-Wed)", reason: "Blocks fat burning" },
    { name: "Vegetables (Thu-Fri)", reason: "Fiber adds gut weight" },
    { name: "Fruits (Thu-Fri)", reason: "Fiber adds gut weight" },
    { name: "Whole grains (Thu-Fri)", reason: "Fiber adds gut weight" },
    { name: "Brown rice (Thu-Fri)", reason: "Fiber adds gut weight" },
    { name: "Oatmeal (Thu-Fri)", reason: "Fiber adds gut weight" },
    { name: "Beans/legumes (Thu-Fri)", reason: "High fiber + gas" },
    { name: "Nuts (Thu-Fri)", reason: "Fiber + fat" },
    { name: "Seeds (Thu-Fri)", reason: "Fiber + fat" },
    { name: "Fatty meats", reason: "Slow digestion" },
    { name: "Fried foods", reason: "Slow digestion, bloating" },
    { name: "Dairy (during cut)", reason: "Can cause bloating" },
    { name: "Carbonated drinks", reason: "Gas and bloating" },
    { name: "High-fat foods", reason: "Slow glycogen restoration" },
    { name: "Alcohol", reason: "Dehydrates, empty calories" },
    { name: "Spicy foods (Thu-Fri)", reason: "Can cause GI issues" },
    { name: "Large meals (Thu-Fri)", reason: "Gut weight" },
  ] as AvoidFood[],

  recovery: [
    { name: "Whole eggs", ratio: "N/A", serving: "3-4 eggs", carbs: 2, note: "Full recovery protein + fats" },
    { name: "Chicken breast", ratio: "N/A", serving: "6-8 oz", carbs: 0, note: "Lean protein rebuild" },
    { name: "Beef/Steak", ratio: "N/A", serving: "6-8 oz", carbs: 0, note: "Iron + creatine repletion" },
    { name: "Greek yogurt", ratio: "N/A", serving: "1-2 cups", carbs: 8, note: "Protein + probiotics" },
    { name: "Whey protein", ratio: "N/A", serving: "1-2 scoops", carbs: 3, note: "Fast absorbing protein" },
    { name: "White rice", ratio: "0:100", serving: "2-3 cups", carbs: 90, note: "Glycogen refill" },
    { name: "Potatoes", ratio: "0:100", serving: "2 medium", carbs: 74, note: "Potassium + carbs" },
    { name: "Pasta", ratio: "0:100", serving: "2 cups cooked", carbs: 86, note: "Glycogen loading" },
    { name: "Bread", ratio: "0:100", serving: "4 slices", carbs: 52, note: "Easy carbs" },
    { name: "Fruit (all types)", ratio: "varies", serving: "2-3 servings", carbs: 45, note: "Vitamins + fiber OK today" },
    { name: "Vegetables", ratio: "N/A", serving: "unlimited", carbs: 10, note: "Fiber OK - gut reset" },
    { name: "Oatmeal", ratio: "0:100", serving: "1 cup dry", carbs: 54, note: "Slow carbs for recovery" },
    { name: "Casein shake", ratio: "N/A", serving: "1 scoop", carbs: 3, note: "Before bed - overnight recovery" },
  ] as RecoveryFood[],

  tournament: [
    { name: "Electrolyte drink", ratio: "45:55", serving: "16-20 oz", carbs: 21, timing: "0-5 min post" },
    { name: "Dextrose drink", ratio: "0:100", serving: "20-30g", carbs: 25, timing: "0-5 min post" },
    { name: "Rice cakes + honey", ratio: "25:75", serving: "2-3 cakes", carbs: 30, timing: "10-15 min" },
    { name: "Energy gel", ratio: "30:70", serving: "1 packet", carbs: 22, timing: "10-15 min" },
    { name: "Gummy bears", ratio: "55:45", serving: "handful", carbs: 22, timing: "10-15 min" },
    { name: "Apple juice", ratio: "70:30", serving: "8-12 oz", carbs: 28, timing: "20-30 min" },
    { name: "Grape juice", ratio: "55:45", serving: "8-12 oz", carbs: 36, timing: "20-30 min" },
    { name: "Sports drink", ratio: "45:55", serving: "16 oz", carbs: 21, timing: "20-30 min" },
    { name: "Small white rice", ratio: "0:100", serving: "1/2 cup", carbs: 22, timing: "40-50 min" },
    { name: "Ripe banana", ratio: "50:50", serving: "1 medium", carbs: 27, timing: "40-50 min" },
    { name: "White bread + honey", ratio: "25:75", serving: "1 slice", carbs: 20, timing: "40-50 min" },
    { name: "Electrolyte sipping", ratio: "45:55", serving: "16-24 oz/hr", carbs: 21, timing: "Continuous" },
  ] as TournamentFood[],

  supplements: [
    { name: "Leucine", serving: "5g with collagen", note: "Add to collagen for muscle preservation" },
    { name: "TUDCA", serving: "250mg AM/PM", note: "Liver support during high fructose" },
    { name: "Choline", serving: "500mg AM/PM", note: "Fat metabolism support" },
    { name: "Electrolyte powder", serving: "1-2 scoops", note: "Add to all water" },
    { name: "Sodium (salt)", serving: "1-2g per liter", note: "Critical for hydration" },
    { name: "Magnesium", serving: "400mg", note: "Prevents cramping" },
    { name: "Potassium", serving: "from food", note: "Bananas, potatoes" },
  ] as Supplement[],

  fuelTanks: [
    {
      name: "Water",
      loseRate: "Hours (2-8 lbs in practice)",
      replenishRate: "1-3 hours with fluids + sodium + carbs",
      performanceCost: "High",
      declinePoint: ">3% dehydration = early decline; 5%+ = clear drop; 6%+ = major decline"
    },
    {
      name: "Glycogen",
      loseRate: "1-2 days (30-60% after hard practice, 2-3 lbs)",
      replenishRate: "4-6 hours to 70-80%; 20-24 hours for full",
      performanceCost: "High",
      declinePoint: "20-30% depletion = early flatness; 40-50% = speed/pop drop; 60-70% = severe fatigue"
    },
    {
      name: "Gut Content",
      loseRate: "12-24 hours (low-fiber/liquid meals drop 1-3 lbs)",
      replenishRate: "12-24 hours",
      performanceCost: "None",
      declinePoint: "No performance decline unless paired with dehydration or low carbs"
    },
    {
      name: "Fat",
      loseRate: "Weeks (0.5-2 lbs/week)",
      replenishRate: "Weeks",
      performanceCost: "None",
      declinePoint: "No performance decline — fat loss improves power-to-weight ratio"
    },
    {
      name: "Muscle",
      loseRate: "Weeks (only with chronic restriction/dehydration)",
      replenishRate: "Weeks-months",
      performanceCost: "Critical",
      declinePoint: "Any muscle loss = immediate strength/power decline"
    },
  ] as FuelTank[],
};
