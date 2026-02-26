export default async function handler(req, res) {
  const target = 'https://api.al-style.kz';
  const path = req.url.replace('/api/proxy', '');
  const url = target + path;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }

  const response = await fetch(url, {
    method: req.method,
    headers,
  });

  const text = await response.text();
  res.status(response.status).send(text);
}