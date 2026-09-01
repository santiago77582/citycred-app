package com.gastocontrol.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Financial notification parser. It deliberately works from notification text
 * only; it never reads another app's screen or asks for banking credentials.
 */
public final class NotificationParser {
    private static final Pattern MONEY_PREFIX = Pattern.compile(
            "(?i)(?:AR\\$|\\$|ARS\\s*)\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)"
    );
    private static final Pattern MONEY_SUFFIX = Pattern.compile(
            "(?i)([0-9]{1,3}(?:[.\\s][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)\\s*(?:pesos?|ars)\\b"
    );

    private NotificationParser() {}

    public static Parsed parse(String packageName, String appName, String title, String text, long when) {
        return parse(packageName, appName, title, text, when, false);
    }

    public static Parsed parse(String packageName, String appName, String title, String text, long when, boolean trustedSource) {
        String original = join(title, text);
        if (original.trim().isEmpty()) return null;

        String normalized = normalize(original);
        if (looksLikePromotionOrBalance(normalized)) return null;

        boolean financialSource = trustedSource || isFinancialSource(packageName, appName);

        // First try provider-aware profiles. They understand the short phrases
        // used by the most common Argentine wallets/banks and are deliberately
        // conservative: if a profile cannot prove direction + amount, the
        // generic parser below gets a chance instead of inventing a movement.
        Parsed profiled = ProviderNotificationParser.tryParse(packageName, appName, title, text, when);
        if (profiled != null) return profiled;

        String direction = direction(normalized, financialSource);
        if (direction == null) return null;

        Double amount = extractAmount(original);
        if (amount == null || amount <= 0) return null;

        String merchant = merchant(title, text, appName);
        String category = categorize(normalize(merchant + " " + original));
        boolean transferLike = containsAny(normalized,
                "transferiste", "transferencia realizada", "transferencia enviada", "transferencia recibida",
                "enviaste dinero", "envio de dinero", "recibiste dinero", "te transfirieron", "transferencia");
        String key = makeKey(packageName, direction, amount, normalized, when);

        return new Parsed(amount, direction, merchant, category, appName, key, when, transferLike);
    }

    private static String direction(String s, boolean financialSource) {
        // ---- Puntos de extensión: para reconocer un nuevo formato de aviso,
        // agregá su frase (en minúsculas y sin acentos) al array correspondiente.
        String[] incoming = {
                "recibiste", "recibiste una transferencia", "te transfirieron", "transferencia recibida",
                "transferencia acreditada", "acreditacion", "acreditado", "se acredito", "dinero acreditado",
                "deposito recibido", "depositaste dinero", "dinero recibido", "ingreso", "ingresaron", "ingreso de dinero",
                "cobraste", "te pagaron", "pago recibido", "cobro recibido", "devolucion recibida", "reintegro",
                "cashback acreditado", "saldo a favor acreditado", "recibiste un pago", "te acreditamos",
                "acreditamos", "cobro exitoso", "recibiste dinero", "transferencia a tu favor", "te enviaron"
        };
        for (String k : incoming) if (s.contains(k)) return "INCOME";

        String[] outgoing = {
                "pagaste", "pago realizado", "pago exitoso", "pago aprobado", "pago confirmado", "pago programado",
                "pago automatico", "hiciste un pago", "realizaste un pago", "pago con qr", "pago qr", "abonaste", "abono",
                "compra", "compraste", "compra aprobada", "compra realizada", "hiciste una compra", "compra internacional",
                "transferiste", "transferencia realizada", "transferencia enviada", "transferencia exitosa",
                "enviaste", "enviaste dinero", "envio de dinero", "debito", "debito realizado",
                "debito automatico", "se debito", "se te debito", "consumo", "consumo realizado", "retiro", "retiraste",
                "extraccion", "cargo realizado", "cargo por", "cobro realizado", "suscripcion", "cuota debitada",
                "pagaste con", "gastaste"
        };
        for (String k : outgoing) if (s.contains(k)) return "EXPENSE";

        // Banks often shorten notifications to "Transferencia $..." or "Pago $...".
        // Only use this fallback for a known financial source and avoid promotional/balance messages.
        if (financialSource) {
            // A bare "Transferencia $..." is ambiguous: it may be incoming or
            // outgoing. Directional transfer phrases are handled above; do not
            // invent a direction here. This avoids turning received money into
            // a false expense.
            if (containsAny(s, "pago", "compra", "consumo", "debito", "extraccion", "retiro", "qr")) {
                return "EXPENSE";
            }
        }
        return null;
    }

    private static boolean looksLikePromotionOrBalance(String s) {
        if (containsAny(s, "reintegro", "cashback acreditado", "devolucion recibida")) return false;
        return containsAny(s,
                "promocion", "promo ", "beneficio", "descuento disponible", "oferta", "sorteo",
                "saldo disponible", "dinero disponible", "limite disponible", "limite de compra",
                "recordatorio de vencimiento", "recorda que", "podes ahorrar", "cupon", "cashback de hasta");
    }

    static Double extractAmount(String s) {
        Matcher m = MONEY_PREFIX.matcher(s);
        if (m.find()) return parseAmount(m.group(1));
        m = MONEY_SUFFIX.matcher(s);
        if (m.find()) return parseAmount(m.group(1));
        return null;
    }

    private static Double parseAmount(String raw) {
        if (raw == null) return null;
        raw = raw.replace(" ", "").trim();
        // Argentine format: 1.234,56. If only one separator exists, infer decimal
        // only when it has 1-2 digits after it; otherwise treat it as thousands.
        if (raw.contains(",")) raw = raw.replace(".", "").replace(',', '.');
        else if (raw.indexOf('.') >= 0) {
            int last = raw.lastIndexOf('.');
            int digits = raw.length() - last - 1;
            if (digits == 3) raw = raw.replace(".", "");
        }
        try { return Double.parseDouble(raw); } catch (NumberFormatException e) { return null; }
    }

    private static String merchant(String title, String text, String appName) {
        String t = title == null ? "" : title.trim();
        String body = text == null ? "" : text.trim();
        String lowerTitle = normalize(t);
        String lowerApp = normalize(appName);

        if (!t.isEmpty() && !lowerTitle.equals(lowerApp)
                && !containsAny(lowerTitle, "mercado pago", "cuenta dni", "notificacion", "transferencia", "pago aprobado", "pago realizado", "compra aprobada")) {
            return cleanMerchant(t);
        }

        Pattern p = Pattern.compile("(?i)(?:\\ben\\b|\\ba\\b|\\bpara\\b|\\bcomercio[: ]+)\\s*([^,.;\\n]+)");
        Matcher m = p.matcher(body);
        if (m.find()) {
            String candidate = m.group(1).replaceAll("(?i)\\s+con\\s+.*$", "").trim();
            candidate = candidate.replaceAll("(?i)\\s+(?:por|de)\\s+(?:AR\\$|\\$|ARS).*", "").trim();
            if (candidate.length() >= 2 && candidate.length() <= 60) return cleanMerchant(candidate);
        }

        return appName == null || appName.isBlank() ? "Movimiento detectado" : appName;
    }

    private static String cleanMerchant(String s) {
        String out = s.replaceAll("\\s+", " ").trim();
        if (out.length() > 60) out = out.substring(0, 60).trim();
        return out;
    }

    public static boolean isFinancialSource(String packageName, String appName) {
        String s = normalize((packageName == null ? "" : packageName) + " " + (appName == null ? "" : appName));
        return containsAny(s,
                "mercado pago", "mercadopago", "cuenta dni", "banco provincia", "bancoprovincia", "bip movil",
                "modo", "uala", "brubank", "naranja x", "naranjax", "personal pay", "personalpay", "prex",
                "lemon", "belo", "letsbit", "fiwind", "astropay", "tap", "bind", "ank",
                "banco nacion", "bna", "santander", "galicia", "bbva", "macro", "supervielle", "credicoop",
                "icbc", "hsbc", "patagonia", "hipotecario", "comafi", "columbia", "itau", "rebanking",
                "visa", "mastercard", "amex", "cabal", "tarjeta naranja", "american express", "bank", "banco");
    }

    /**
     * Keyword-based categorization. To support a new merchant/service, just add
     * its lowercase, accent-free keyword to the matching line. Learned rules
     * (created when the user taps "Recordar para la próxima") are applied later,
     * in {@link ExpenseDbHelper#insertParsed}, and take precedence over this.
     */
    public static String categorize(String s) {
        s = normalize(s);
        if (containsAny(s, "carrefour", "coto", "jumbo", "vea", "chango", "supermerc", "almacen", "despensa", "makro", "la anonima", "disco", "walmart", "maxiconsumo", "diarco", "yaguar", "hipermercado", "super dia")) return "Supermercado";
        if (containsAny(s, "pedidosya", "rappi", "restaurant", "restaurante", "pizza", "burger", "mcdonald", "cafeter", "comida", "panaderia", "heladeria", "starbucks", "mostaza", "kfc", "sushi", "parrilla", "bar ", "kiosco", "kiosko")) return "Comida";
        if (containsAny(s, "ypf", "shell", "axion", "puma energy", "nafta", "combustible", "estacion de servicio", "gnc")) return "Combustible";
        if (containsAny(s, "uber", "cabify", "didi", "taxi", "remis", "colectivo", "sube", "transporte", "peaje", "telepase", "estacionamiento", "cochera", "aerolineas", "flybondi", "jetsmart", "pasaje")) return "Transporte";
        if (containsAny(s, "movistar", "personal", "claro", "internet", "fibra", "fibertel", "telecentro", "telecom", "iplan", "flow", "directv", "recarga")) return "Telefonía e Internet";
        if (containsAny(s, "edes", "edenor", "edesur", "edelap", "camuzzi", "metrogas", "naturgy", "agua", "aysa", "absa", "luz", "energia", "cooperativa electrica") || s.matches(".*\\bgas\\b.*")) return "Servicios";
        if (containsAny(s, "netflix", "spotify", "youtube premium", "youtube music", "disney", "hbo", "max ", "amazon prime", "prime video", "paramount", "star+", "star plus", "crunchyroll", "mubi", "apple.com/bill", "itunes", "google one", "icloud", "canva", "chatgpt", "openai", "suscripcion", "membresia")) return "Suscripciones";
        if (containsAny(s, "farmacia", "farmacity", "medic", "clinica", "hospital", "laboratorio", "odontolog", "sancor salud", "osde", "swiss medical", "galeno", "medife", "prepaga")) return "Salud";
        if (containsAny(s, "seguro", "sancor seguros", "federacion patronal", "mercantil andina", "la caja", "zurich", "provincia seguros", "rivadavia seguros")) return "Seguros";
        if (containsAny(s, "arba", "afip", "arca", "municip", "impuesto", "patente", "rentas", "abl", "sirtac", "ingresos brutos")) return "Impuestos";
        if (containsAny(s, "mercadolibre", "mercado libre", "tienda", "shopping", "fravega", "musimundo", "garbarino", "cetrogar", "megatone", "amazon", "aliexpress", "shein", "temu")) return "Compras";
        if (containsAny(s, "colegio", "universidad", "instituto", "curso", "educacion", "libreria", "cuota escolar", "udemy", "platzi")) return "Educación";
        if (containsAny(s, "alquiler", "expensas", "inmobiliaria", "consorcio", "administracion edificio")) return "Vivienda";
        if (containsAny(s, "veterinaria", "mascota", "pet shop", "puppis", "kanina")) return "Mascotas";
        if (containsAny(s, "cuota", "prestamo", "credito", "financiera", "tarjeta de credito", "resumen de tarjeta")) return "Deudas y cuotas";
        return "Otros";
    }

    public static boolean containsAny(String s, String... words) {
        for (String word : words) if (s.contains(word)) return true;
        return false;
    }

    private static String join(String a, String b) {
        return (a == null ? "" : a) + " " + (b == null ? "" : b);
    }

    public static String normalize(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    static String makeKey(String packageName, String direction, double amount, String normalized, long when) {
        return sha256((packageName == null ? "" : packageName) + "|" + direction + "|" + amount + "|" + normalized + "|" + (when / 300000L));
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(value.hashCode());
        }
    }

    public static class Parsed {
        public final double amount;
        public final String direction;
        public final String merchant;
        public final String category;
        public final String source;
        public final String dedupeKey;
        public final long createdAt;
        public final boolean transferLike;

        Parsed(double amount, String direction, String merchant, String category,
               String source, String dedupeKey, long createdAt, boolean transferLike) {
            this.amount = amount;
            this.direction = direction;
            this.merchant = merchant;
            this.category = category;
            this.source = source;
            this.dedupeKey = dedupeKey;
            this.createdAt = createdAt;
            this.transferLike = transferLike;
        }
    }
}
