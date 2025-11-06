This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Supabase Setup

### 1) Cài đặt dependencies

- Các package Supabase (`@supabase/supabase-js`, `@supabase/ssr`) đã được khai báo trong `package.json`.
- Chạy `npm install` để tải về đầy đủ dependencies.

### 2) Cấu hình biến môi trường

- Tạo file `.env.local` với nội dung:

```
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY="YOUR_ANON_OR_PUBLISHABLE_KEY"
NEXT_PUBLIC_SITE_URL="https://your-app.vercel.app"
```

- Lấy các giá trị từ Supabase Dashboard:
  - `Project URL`: vào `Settings -> API`.
  - `anon key` hoặc `publishable key`: vào `Settings -> API -> Project API keys`.

Biến `NEXT_PUBLIC_SITE_URL` giúp chuẩn hoá domain gốc khi tạo link trong email của Supabase (confirm/reset). Nếu không có biến này:
- Ở client sẽ fallback sang `window.location.origin` (có thể thành `http://localhost:3000` nếu bạn đang chạy local).
- Ở server sẽ fallback thành `http://localhost:3000`.

### 3) Cấu hình URL trong Supabase Dashboard

Vào `Authentication -> URL Configuration`:

1) `Site URL`: đặt thành domain deploy (ví dụ `https://your-app.vercel.app`).
2) `Redirect URLs`: thêm đầy đủ đường dẫn xác thực cho cả local và production (ví dụ):

- `https://your-app.vercel.app/protected`
- `https://your-app.vercel.app/auth/update-password`
- `https://your-app.vercel.app/auth/confirm`
- `http://localhost:3000/protected`
- `http://localhost:3000/auth/update-password`
- `http://localhost:3000/auth/confirm`

### 4) Chạy dự án

- `npm run dev` và mở `http://localhost:3000`.
- Nếu thấy link email xác nhận/reset trỏ về `localhost:3000` khi deploy, kiểm tra:
  - `.env.local` có `NEXT_PUBLIC_SITE_URL` đúng domain Vercel chưa.
  - `Authentication -> URL Configuration` đã cập nhật `Site URL` và `Redirect URLs` chưa.
