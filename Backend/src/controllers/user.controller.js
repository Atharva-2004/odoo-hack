import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { FoodItem } from "../models/foodItems.models.js"
//import { uploadToCloudinary  } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";


const generateAccessToken = async(userId) => {
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        // const refreshToken = user.generateRefreshToken();
        // user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false});
        return { accessToken };
}   catch (error) {
        throw new ApiError(500, "Failed to generate tokens");
    }
} 


const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email) throw new ApiError(400, "Email is required");
    if (!password) throw new ApiError(400, "Password is required");

    const user = await User.findOne({ email });
    if (!user) throw new ApiError(404, "User not found, Unauthorized");

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) throw new ApiError(401, "Invalid password");

    const { accessToken } = await generateAccessToken(user._id);

    const foodItems = await FoodItem.find({ user: user._id });

    // Update status for all food items and include them in the response
    const updatedFoodItems = await Promise.all(
        foodItems.map(async (item) => {
            const today = new Date();
            const expiry = new Date(item.expiryDate);
            const diffTime = expiry - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let newStatus = "";
            if (diffDays > 7) newStatus = "good";
            else if (diffDays <= 7 && diffDays >= 0) newStatus = "expiring soon";
            else newStatus = "expired";

            // Update the database only if the status has changed
            if (item.status !== newStatus) {
                await FoodItem.findByIdAndUpdate(
                    item._id,
                    { $set: { status: newStatus } },
                    { new: true }
                );
            }

            // Always return the food item with its updated status
            return { ...item._doc, status: newStatus };
        })
    );

    const loggedInUser = await User.findById(user._id).select("-password");

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    loggedInUser,
                    accessToken,
                    updatedFoodItems, // Return all food items
                },
                "User logged in successfully"
            )
        );
});

// const loginUser = asyncHandler(async (req, res) => {
//     const { email, password } = req.body;

//     if (!email) throw new ApiError(400, "Email is required");
//     if (!password) throw new ApiError(400, "Password is required");

//     const user = await User.findOne({ email });
//     if (!user) throw new ApiError(404, "User not found, Unauthorized");

//     const isPasswordValid = await user.isPasswordCorrect(password);
//     if (!isPasswordValid) throw new ApiError(401, "Invalid password");

//     const { accessToken } = await generateAccessToken(user._id);

//     const foodItems = await FoodItem.find({ user: user._id });

//     // Update status for all food items and include them in the response
//     const updatedFoodItems = await Promise.all(
//         foodItems.map(async (item) => {
//             const today = new Date();
//             const expiry = new Date(item.expiryDate);
//             const diffTime = expiry - today;
//             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

//             let newStatus = "";
//             if (diffDays > 7) newStatus = "good";
//             else if (diffDays <= 7 && diffDays >= 0) newStatus = "expiring soon";
//             else newStatus = "expired";

//             // Update the database only if the status has changed
//             if (item.status !== newStatus) {
//                 await FoodItem.findByIdAndUpdate(
//                     item._id,
//                     { $set: { status: newStatus } },
//                     { new: true }
//                 );
//             }

//             // Always return the food item with its updated status
//             return { ...item._doc, status: newStatus };
//         })
//     );

//     const loggedInUser = await User.findById(user._id).select("-password");

//     const options = {
//         httpOnly: true,
//         secure: true,
//     };

//     return res
//         .status(200)
//         .cookie("accessToken", accessToken, options)
//         .json(
//             new ApiResponse(
//                 200,
//                 {
//                     loggedInUser,
//                     accessToken,
//                     updatedFoodItems, // Return all food items
//                 },
//                 "User logged in successfully"
//             )
//         );
// });



const addFoodItem = asyncHandler(async(req, res) => {
    const updateFoodItemStatus = (expiryDate) => {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 7) {
            return "good";
        } else if (diffDays <= 7 && diffDays >= 0) {
            return "expiring soon";
        } else {
            return "expired";
        }
    };    
    const { name, quantity, manufacturingDate, expiryDate } = req.body;

        if (!(name && quantity && manufacturingDate && expiryDate)) {
            throw new ApiError(400, "All fields are required");
        }

        const status = updateFoodItemStatus(expiryDate);

        const newFoodItem = new FoodItem({
            name,
            quantity,
            manufacturingDate,
            expiryDate,
            status,
            user: req.user._id // Associate the food item with the user
        });

        await newFoodItem.save();

        res.status(201).json(newFoodItem);
});


export { loginUser, addFoodItem }
