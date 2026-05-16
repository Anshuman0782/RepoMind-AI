SUPPORTED_RESPONSE_LANGUAGES = {
    "auto": "the same language as the user's message",
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "gu": "Gujarati",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese",
    "ar": "Arabic",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
}


MULTILINGUAL_CHANGE_TERMS = (
    "fix",
    "create",
    "add",
    "new",
    "make",
    "build",
    "edit",
    "modify",
    "delete",
    "remove",
    "update",
    "refactor",
    "change file",
    "ठीक",
    "बनाओ",
    "बनाना",
    "जोड़",
    "नया",
    "नई",
    "संपादित",
    "बदल",
    "हटाओ",
    "हटाना",
    "अपडेट",
    "सुधार",
    "crear",
    "agregar",
    "editar",
    "cambiar",
    "eliminar",
    "actualizar",
    "corriger",
    "creer",
    "ajouter",
    "modifier",
    "supprimer",
    "mettre a jour",
    "\u09a0\u09bf\u0995",
    "\u09ac\u09a6\u09b2",
    "\u09b8\u09ae\u09be\u09a7\u09be\u09a8",
    "\u09b8\u0982\u09b6\u09cb\u09a7\u09a8",
    "\u0986\u09aa\u09a1\u09c7\u099f",
)

MULTILINGUAL_BUG_TERMS = (
    "bug",
    "error",
    "fails",
    "failed",
    "not working",
    "broken",
    "issue",
    "बग",
    "त्रुटि",
    "गलती",
    "काम नहीं",
    "टूटा",
    "समस्या",
    "problema",
    "error",
    "no funciona",
    "fallo",
    "erreur",
    "ne fonctionne pas",
    "probleme",
    "\u09ac\u09be\u0997",
    "\u09a4\u09cd\u09b0\u09c1\u099f\u09bf",
    "\u09ad\u09c1\u09b2",
    "\u09b8\u09ae\u09b8\u09cd\u09af\u09be",
    "\u0995\u09be\u099c \u0995\u09b0\u099b\u09c7 \u09a8\u09be",
)

MULTILINGUAL_REVIEW_TERMS = (
    "review diff",
    "review changes",
    "review current",
    "code review",
    "समीक्षा",
    "कोड रिव्यू",
    "revisar",
    "revision de codigo",
    "revue de code",
    "\u09aa\u09b0\u09cd\u09af\u09be\u09b2\u09cb\u099a\u09a8\u09be",
    "\u09b0\u09bf\u09ad\u09bf\u0989",
)

MULTILINGUAL_COMMIT_TERMS = (
    "commit",
    "pull request",
    "pr description",
    "pr title",
    "कमिट",
    "पुल रिक्वेस्ट",
    "crear commit",
    "solicitud de extraccion",
    "commit message",
    "message de commit",
    "\u0995\u09ae\u09bf\u099f",
    "\u09aa\u09c1\u09b2 \u09b0\u09bf\u0995\u09cb\u09af\u09bc\u09c7\u09b8\u09cd\u099f",
)

MULTILINGUAL_NAVIGATION_TERMS = (
    "where ",
    "where is",
    "where are",
    "find area",
    "handled",
    "implemented",
    "कहाँ",
    "कहा",
    "ढूंढ",
    "किस फाइल",
    "donde",
    "buscar",
    "ou est",
    "trouver",
    "\u0995\u09cb\u09a5\u09be\u09af\u09bc",
    "\u0996\u09c1\u0981\u099c",
    "\u0996\u09c1\u0981\u099c\u09c7",
    "\u09ab\u09be\u0987\u09b2",
)

MULTILINGUAL_ARCHITECTURE_TERMS = (
    "architecture",
    "architecture map",
    "file structure",
    "folder structure",
    "project structure",
    "repo structure",
    "repository structure",
    "directory structure",
    "diagram",
    "er diagram",
    "erd",
    "entity relationship",
    "data model",
    "schema diagram",
    "system map",
    "dependency map",
    "आर्किटेक्चर",
    "फाइल संरचना",
    "फोल्डर संरचना",
    "प्रोजेक्ट संरचना",
    "डायग्राम",
    "estructura",
    "arquitectura",
    "diagrama",
    "structure",
    "architecture",
    "diagramme",
    "\u0986\u09b0\u09cd\u0995\u09bf\u099f\u09c7\u0995\u099a\u09be\u09b0",
    "\u09ab\u09be\u0987\u09b2 \u0997\u09a0\u09a8",
    "\u09a1\u09be\u09af\u09bc\u09be\u0997\u09cd\u09b0\u09be\u09ae",
)

MULTILINGUAL_ARCHITECTURE_VIEW_TERMS = (
    "view",
    "show",
    "open",
    "display",
    "visual",
    "visualize",
    "map",
    "diagram",
    "structure",
    "overview",
    "दिखाओ",
    "खोलो",
    "मानचित्र",
    "mostrar",
    "abrir",
    "mapa",
    "afficher",
    "ouvrir",
    "carte",
    "\u09a6\u09c7\u0996\u09be\u0993",
    "\u0996\u09cb\u09b2\u09cb",
    "\u09ae\u09be\u09a8\u099a\u09bf\u09a4\u09cd\u09b0",
)


def normalize_response_language(value: str | None) -> str:
    if not value:
        return "auto"
    normalized = value.strip().lower()
    return normalized if normalized in SUPPORTED_RESPONSE_LANGUAGES else "auto"


def language_instruction(message: str, response_language: str | None = None) -> str:
    normalized = normalize_response_language(response_language)
    if normalized == "auto":
        normalized = detect_message_language(message)
    language = SUPPORTED_RESPONSE_LANGUAGES[normalized]
    return (
        "Language requirement: answer in "
        f"{language}. Preserve code, file paths, commands, identifiers, and quoted errors exactly. "
        "Keep markdown headings and bullets readable in that language."
    )


def message_with_language_instruction(message: str, response_language: str | None = None) -> str:
    return f"{message}\n\n{language_instruction(message, response_language)}"


def detect_message_language(message: str) -> str:
    if re_search(r"[\u0980-\u09ff]", message):
        return "bn"
    if re_search(r"[\u0900-\u097f]", message):
        return "hi"
    return "auto"


def is_bengali_message(message: str, response_language: str | None = None) -> bool:
    return normalize_response_language(response_language) == "bn" or detect_message_language(message) == "bn"


def response_language_for_message(message: str, response_language: str | None = None) -> str:
    normalized = normalize_response_language(response_language)
    if normalized != "auto":
        return normalized
    detected = detect_message_language(message)
    return detected if detected != "auto" else "en"


def contains_any_term(message: str, terms: tuple[str, ...]) -> bool:
    lowered = _ascii_fold(message.lower())
    return any(_ascii_fold(term.lower()) in lowered for term in terms)


def re_search(pattern: str, value: str) -> bool:
    import re

    return re.search(pattern, value) is not None


def _ascii_fold(value: str) -> str:
    return (
        value.replace("á", "a")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ä", "a")
        .replace("ã", "a")
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("ë", "e")
        .replace("í", "i")
        .replace("ì", "i")
        .replace("î", "i")
        .replace("ï", "i")
        .replace("ó", "o")
        .replace("ò", "o")
        .replace("ô", "o")
        .replace("ö", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ù", "u")
        .replace("û", "u")
        .replace("ü", "u")
        .replace("ç", "c")
        .replace("ñ", "n")
    )
