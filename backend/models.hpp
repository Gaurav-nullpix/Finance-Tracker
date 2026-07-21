#pragma once

// Core data models for the finance tracker backend.

#include <cstdint>
#include <string>
#include <vector>

namespace ft {

// Valid expense categories (fixed set → O(1) validation via string compare).
inline bool isValidCategory(const std::string& category) {
    return category == "food" || category == "transport" || category == "clothes"
        || category == "study" || category == "other";
}

// Auto-detect category from item name.
inline std::string detectCategory(const std::string& itemName) {
    std::string lower;
    for (char c : itemName) {
        lower += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }

    // Study keywords (check first for better priority)
    if (lower.find("book") != std::string::npos ||
        lower.find("pen") != std::string::npos ||
        lower.find("pencil") != std::string::npos ||
        lower.find("copy") != std::string::npos ||
        lower.find("tuition") != std::string::npos ||
        lower.find("class") != std::string::npos ||
        lower.find("exam") != std::string::npos ||
        lower.find("test") != std::string::npos ||
        lower.find("college") != std::string::npos ||
        lower.find("university") != std::string::npos ||
        lower.find("assignment") != std::string::npos ||
        lower.find("library") != std::string::npos) {
        return "study";
    }

    // Food keywords
    if (lower.find("momo") != std::string::npos ||
        lower.find("noodle") != std::string::npos ||
        lower.find("rice") != std::string::npos ||
        lower.find("bread") != std::string::npos ||
        lower.find("milk") != std::string::npos ||
        lower.find("egg") != std::string::npos ||
        lower.find("meat") != std::string::npos ||
        lower.find("lunch") != std::string::npos ||
        lower.find("dinner") != std::string::npos ||
        lower.find("breakfast") != std::string::npos ||
        lower.find("sweet") != std::string::npos ||
        lower.find("chocolate") != std::string::npos ||
        lower.find("biscuit") != std::string::npos ||
        lower.find("coffee") != std::string::npos ||
        lower.find("tea") != std::string::npos) {
        return "food";
    }

    // Clothing keywords
    if (lower.find("shirt") != std::string::npos ||
        lower.find("pant") != std::string::npos ||
        lower.find("dress") != std::string::npos ||
        lower.find("skirt") != std::string::npos ||
        lower.find("jacket") != std::string::npos ||
        lower.find("shoe") != std::string::npos ||
        lower.find("sock") != std::string::npos ||
        lower.find("underwear") != std::string::npos ||
        lower.find("hat") != std::string::npos ||
        lower.find("cap") != std::string::npos ||
        lower.find("scarf") != std::string::npos ||
        lower.find("belt") != std::string::npos ) {
        return "clothes";
    }

    // Transport keywords
    if (lower.find("bus") != std::string::npos ||
        lower.find("taxi") != std::string::npos ||
        lower.find("indrive") != std::string::npos ||
         lower.find("pathau") != std::string::npos ||
        lower.find("travel") != std::string::npos) {
        return "transport";
    }

    return "other";
}

// User profile collected during onboarding.
struct UserProfile {
    bool isStudent = true;
    bool inHostel = true;
    std::string maritalStatus; // "single" | "married" | ""
    bool hasKids = false;
    bool hasLoan = false;
    int loanAmount = 0;
    int budget = 0;
};

// Single expense transaction — append-only; aggregation done on read.
struct Transaction {
    std::uint64_t id = 0;
    std::string name;
    std::string category;
    int amount = 0;
    std::int64_t timestamp = 0; // Unix epoch milliseconds
};

// Registered user account.
struct User {
    std::uint64_t id = 0;
    std::string email;
    std::string passwordHash;
    std::string displayName;
    UserProfile profile;
    std::vector<Transaction> transactions;
};

// Aggregated item stats for "top purchased" dashboard section.
struct ItemAggregate {
    std::string name;
    std::string category;
    int count = 0;
    int totalAmount = 0;
    int lastUnitPrice = 0;
};

// Category spending summary.
struct CategorySummary {
    std::string category;
    int total = 0;
};

// Full dashboard payload returned by GET /api/dashboard.
struct DashboardData {
    int budget = 0;
    int spent = 0;
    int remaining = 0;
    int budgetUsedPct = 0;
    int daysLeftInMonth = 0;
    bool hasLoan = false;
    int loanAmount = 0;
    std::string topCategory;
    int topCategoryAmount = 0;
    std::string topItemName;
    int topItemCount = 0;
    int topItemLastPrice = 0;
    std::string budgetWarning;
    bool isOverBudget = false;
    std::vector<CategorySummary> categories;
    std::vector<ItemAggregate> topItems;
    std::vector<Transaction> recentTransactions;
};

} 
