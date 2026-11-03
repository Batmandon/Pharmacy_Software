import hashlib
import json
import re


def _n(text):
    """Normalise one piece of text so harmless differences do not matter:
    "  Dolo   650 " -> "dolo 650",  "650 MG" -> "650mg"."""
    text = re.sub(r"\s+", " ", (text or "").strip().lower())   # many spaces -> one, lower case
    return re.sub(r"(\d)\s+([a-z%])", r"\1\2", text)           # "650 mg" -> "650mg"


def make_signature(name, form, pack_size, salts):
    """Fingerprint of what makes a product "the same product".

    salts: list of (salt_id, salt_strength). Their order does not matter.
    The salt's id is used, not its name, so renaming a salt never changes a product's signature.
    The products table has UNIQUE (signature), so the database itself rejects duplicates,
    on insert and on edit, even when two requests arrive at the same moment.
    """
    parts = [
        _n(name),
        _n(form),
        _n(pack_size),
        sorted(f"{salt_id}:{_n(salt_strength)}" for salt_id, salt_strength in salts),
    ]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()
