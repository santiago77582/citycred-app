import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_ADMIN_PASSWORD } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { createUser, updateUser } = await import('../crm/teamRepository.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function login(params: {
  email?: string;
  password: string;
}): Promise<{ response: Response; cookie: string }> {
  const body = new URLSearchParams();
  if (params.email !== undefined) body.set('email', params.email);
  body.set('password', params.password);
  const response = await fetch(`${server.baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual'
  });
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { response, cookie: setCookie.split(';', 1)[0] ?? '' };
}

async function adminRequest(
  path: string,
  cookie: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${server.baseUrl}/admin${path}`, {
    ...options,
    headers: {
      cookie,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  });
}

test('la pantalla ofrece correo y conserva el acceso administrativo de emergencia', async () => {
  const page = await fetch(`${server.baseUrl}/admin/login`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /name="email"/);
  assert.match(html, /Acceso de emergencia/);

  const emergency = await login({ password: TEST_ADMIN_PASSWORD });
  assert.equal(emergency.response.status, 303);
  assert.ok(emergency.cookie.includes('citycred_admin='));

  const session = await adminRequest('/api/session', emergency.cookie);
  assert.equal(session.status, 200);
  const body = await session.json() as {
    user: { role: string; emergency: boolean; userId: string | null };
  };
  assert.equal(body.user.role, 'ADMIN');
  assert.equal(body.user.emergency, true);
  assert.equal(body.user.userId, null);
});

test('un asesor inicia sesión pero no accede a campañas analíticas ni usuarios', async () => {
  const advisor = await createUser({
    email: 'asesor@citycred.test',
    displayName: 'Asesor Uno',
    password: 'ClaveAsesor123!',
    role: 'ADVISOR'
  });

  const logged = await login({
    email: 'ASESOR@CITYCRED.TEST',
    password: 'ClaveAsesor123!'
  });
  assert.equal(logged.response.status, 303);

  const session = await adminRequest('/api/session', logged.cookie);
  assert.equal(session.status, 200);
  const sessionBody = await session.json() as {
    user: { userId: string; role: string; displayName: string; emergency: boolean };
  };
  assert.equal(sessionBody.user.userId, advisor.id);
  assert.equal(sessionBody.user.role, 'ADVISOR');
  assert.equal(sessionBody.user.displayName, 'Asesor Uno');
  assert.equal(sessionBody.user.emergency, false);

  assert.equal((await adminRequest('/api/conversations', logged.cookie)).status, 200);
  assert.equal((await adminRequest('/api/analytics/dashboard', logged.cookie)).status, 403);
  assert.equal((await adminRequest('/api/campaigns', logged.cookie)).status, 403);
  assert.equal((await adminRequest('/api/crm/users', logged.cookie)).status, 403);
});

test('un administrador puede gestionar usuarios y su auditoría queda atribuida', async () => {
  const admin = await createUser({
    email: 'admin@citycred.test',
    displayName: 'Administrador Uno',
    password: 'ClaveAdmin123!',
    role: 'ADMIN'
  });
  const logged = await login({
    email: 'admin@citycred.test',
    password: 'ClaveAdmin123!'
  });
  assert.equal(logged.response.status, 303);

  const users = await adminRequest('/api/crm/users', logged.cookie);
  assert.equal(users.status, 200);

  const label = await adminRequest('/api/crm/labels', logged.cookie, {
    method: 'POST',
    body: JSON.stringify({ name: 'Documentación completa', color: '#5b36c9' })
  });
  assert.equal(label.status, 201);

  const audit = await base.consultar(
    `SELECT actor_user_id, action FROM audit_events
     WHERE action = 'LABEL_CREATED'
     ORDER BY created_at DESC LIMIT 1`
  );
  assert.equal(audit.rows[0]?.actor_user_id, admin.id);
});

test('desactivar un usuario invalida inmediatamente una sesión existente', async () => {
  const advisor = await createUser({
    email: 'baja@citycred.test',
    displayName: 'Asesor Baja',
    password: 'ClaveAsesor456!',
    role: 'ADVISOR'
  });
  const logged = await login({
    email: 'baja@citycred.test',
    password: 'ClaveAsesor456!'
  });
  assert.equal(logged.response.status, 303);
  assert.equal((await adminRequest('/api/session', logged.cookie)).status, 200);

  await updateUser({ userId: advisor.id, active: false });
  const denied = await adminRequest('/api/session', logged.cookie);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('set-cookie') ?? '', /Max-Age=0/);
});

test('no revela si falló el correo o la contraseña', async () => {
  const unknown = await login({
    email: 'noexiste@citycred.test',
    password: 'ContraseñaIncorrecta'
  });
  assert.equal(unknown.response.status, 401);
  assert.match(await unknown.response.text(), /Correo o contraseña incorrectos/);

  await createUser({
    email: 'existe@citycred.test',
    displayName: 'Usuario Existe',
    password: 'ClaveCorrecta123!',
    role: 'ADVISOR'
  });
  const incorrect = await login({
    email: 'existe@citycred.test',
    password: 'ContraseñaIncorrecta'
  });
  assert.equal(incorrect.response.status, 401);
  assert.match(await incorrect.response.text(), /Correo o contraseña incorrectos/);
});
