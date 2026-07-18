export const INDIVIDUAL_LOGIN_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ingresar — CityCred WhatsApp</title>
  <link rel="stylesheet" href="/admin/assets/app.css">
</head>
<body class="login-page">
  <main class="login-card">
    <div class="logo"><span class="logo-mark">C</span> CityCred WhatsApp</div>
    <h1>Ingresar al panel</h1>
    <p class="help">Ingresá con el correo y la contraseña de tu usuario.</p>
    <form method="post" action="/admin/login">
      <div class="field">
        <label for="email">Correo</label>
        <input id="email" name="email" type="email" autocomplete="username" maxlength="254" autofocus>
      </div>
      <div class="field">
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200">
      </div>
      <button class="primary" type="submit">Entrar</button>
    </form>
    <p class="help" style="margin-top:16px;font-size:13px">
      Acceso de emergencia: dejá el correo vacío y usá la clave administrativa principal.
    </p>
    <!--ERROR-->
  </main>
</body>
</html>`;
