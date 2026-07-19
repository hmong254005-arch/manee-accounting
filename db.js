// db.js - Supabase wrapper for Manee Accounting

const SUPABASE_URL = 'https://jcxzzwcewghlidhtnazp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jqm34XjkOhu0M9Zlp5RCQQ_mOICXi23';

let supabaseClient = null;
let currentUser = null;

function initDB() {
    return new Promise(async (resolve, reject) => {
        try {
            // Initialize Supabase client
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Supabase initialized successfully");
            
            // Check active session
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                currentUser = session.user;
            }
            
            resolve(supabaseClient);
        } catch (error) {
            console.error("Supabase initialization error:", error);
            reject(error);
        }
    });
}

// --- Authentication Operations ---

async function getCurrentUser() {
    if (currentUser) return currentUser;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        return currentUser;
    }
    return null;
}

async function signUpWithEmail(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
    });
    if (error) throw error;
    
    // If auto-confirm is off, data.user might be null or session might be null.
    // In our case (development), they usually auto-login if confirm is disabled.
    if (data.session) {
        currentUser = data.user;
    } else {
        // Fallback: try signing in immediately (in case signup works but doesn't auto-login)
        return signInWithEmail(email, password);
    }
    return data.user;
}

async function signInWithEmail(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });
    if (error) throw error;
    currentUser = data.user;
    return data.user;
}

async function signInAnonymously() {
    const { data, error } = await supabaseClient.auth.signInAnonymously();
    if (error) throw error;
    currentUser = data.user;
    return data.user;
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    currentUser = null;
    return true;
}

// --- Transaction Operations ---

async function addTransaction(transaction) {
    if (!currentUser) throw new Error("Please login first");
    
    transaction.id = Date.now().toString(); // Generate ID
    transaction.user_id = currentUser.id; // Link to user
    
    // Map 'detail' to 'note' for Supabase schema
    if (transaction.detail !== undefined) {
        transaction.note = transaction.detail;
        delete transaction.detail;
    }
    
    const { data, error } = await supabaseClient
        .from('transactions')
        .insert([transaction])
        .select();
        
    if (error) {
        console.error("Error adding transaction:", error);
        throw error;
    }
    return data[0];
}

async function getTransactions() {
    if (!currentUser) return [];
    
    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .order('id', { ascending: false });
        
    if (error) {
        console.error("Error fetching transactions:", error);
        throw error;
    }
    
    // Map 'note' back to 'detail' for frontend
    return (data || []).map(tx => {
        if (tx.note !== undefined) {
            tx.detail = tx.note;
        }
        return tx;
    });
}

async function updateTransaction(transaction) {
    if (!currentUser) throw new Error("Please login first");
    
    // Map 'detail' to 'note' for Supabase schema
    if (transaction.detail !== undefined) {
        transaction.note = transaction.detail;
        delete transaction.detail;
    }
    
    const { data, error } = await supabaseClient
        .from('transactions')
        .update(transaction)
        .eq('id', transaction.id)
        .select();
        
    if (error) {
        console.error("Error updating transaction:", error);
        throw error;
    }
    return data[0];
}

async function deleteTransaction(id) {
    if (!currentUser) throw new Error("Please login first");
    
    const { error } = await supabaseClient
        .from('transactions')
        .delete()
        .eq('id', id);
        
    if (error) {
        console.error("Error deleting transaction:", error);
        throw error;
    }
    return true;
}

// --- Product (Menu) Operations ---

async function addProduct(product) {
    if (!currentUser) throw new Error("Please login first");
    
    product.id = Date.now().toString();
    product.user_id = currentUser.id; // Link to user
    
    const { data, error } = await supabaseClient
        .from('products')
        .insert([product])
        .select();
        
    if (error) {
        console.error("Error adding product:", error);
        throw error;
    }
    return data[0];
}

async function updateProduct(product) {
    if (!currentUser) throw new Error("Please login first");
    
    const { data, error } = await supabaseClient
        .from('products')
        .update(product)
        .eq('id', product.id)
        .select();
        
    if (error) {
        console.error("Error updating product:", error);
        throw error;
    }
    return data[0];
}

async function getProducts() {
    if (!currentUser) return [];
    
    const { data, error } = await supabaseClient
        .from('products')
        .select('*');
        
    if (error) {
        console.error("Error fetching products:", error);
        throw error;
    }
    return data || [];
}

async function deleteProduct(id) {
    if (!currentUser) throw new Error("Please login first");
    
    const { error } = await supabaseClient
        .from('products')
        .delete()
        .eq('id', id);
        
    if (error) {
        console.error("Error deleting product:", error);
        throw error;
    }
    return true;
}

async function clearAllData() {
    if (!currentUser) throw new Error("Please login first");
    
    const { error: txError } = await supabaseClient.from('transactions').delete().eq('user_id', currentUser.id);
    const { error: prError } = await supabaseClient.from('products').delete().eq('user_id', currentUser.id);
    
    if (txError || prError) {
        throw new Error("Failed to clear data");
    }
    return true;
}

// Ensure db is initialized before use
window.dbAPI = {
    initDB,
    getCurrentUser,
    signUpWithEmail,
    signInWithEmail,
    signInAnonymously,
    signOut,
    addTransaction,
    getTransactions,
    updateTransaction,
    deleteTransaction,
    addProduct,
    updateProduct,
    getProducts,
    deleteProduct,
    clearAllData
};
