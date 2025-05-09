// month-hash → allowed months map (copy from unlocker.js)
const monthRules = new Map(Object.entries({
    "e34258d064b18aaa21b6cd24d0e7ccc08f99df8a02b728b7e8da6547197539c8": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    /* …etc… */
}));

async function hashSHA256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, "0")).join("");
}

document.getElementById("check-id-btn").onclick = async () => {
    const id = document.getElementById("employee-id").value.trim();
    const err = document.getElementById("error-message");
    if (!id) return err.textContent = "Please enter an ID.";
    const digest = await hashSHA256(id);
    const allowed = monthRules.get(digest) || [];
    const thisMonth = new Date().getMonth() + 1;
    if (allowed.includes(thisMonth)) {
        sessionStorage.clear();
        window.location.href = "upload.html";
    } else {
        err.textContent = "Access denied.";
    }
};

