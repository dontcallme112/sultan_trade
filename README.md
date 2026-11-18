# Размещение серверной ветки

Эта ветка содержит Express backend и размещается на Railway. React/Vite frontend
находится в ветке `main` и размещается на Vercel. Здесь `vercel.json` задаёт
Ignored Build Step с кодом завершения 0: Vercel отменяет сборку серверной ветки
до запуска `vite build`. Устанавливать Vite в backend не требуется.
