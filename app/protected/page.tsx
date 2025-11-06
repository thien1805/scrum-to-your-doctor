import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/logout-button'
import { createClient } from '@/lib/server'

export default async function ProtectedPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    redirect('/auth/login')
  }

  // Lấy user id từ claims (liên kết với patients.id)
  const userId = String(data.claims.sub)

  // Kiểm tra người dùng đã hoàn tất profile chưa
  const { data: profiles, error: profileError } = await supabase
    .from('patients')
    .select('full_name, gender, dob, phone, citizen_id, id')
    .eq('id', userId)
    .limit(1)

  if (profileError) {
    // Có lỗi khi truy vấn profile, đưa người dùng sang trang set-up-profiles để xử lý
    redirect('/set-up-profiles')
  }

  const hasProfile = Array.isArray(profiles) && profiles.length > 0
  if (!hasProfile) {
    // Chưa có profile thì điều hướng tới trang set-up-profiles trước
    redirect('/set-up-profiles')
  }

  return (
    <div className="flex h-svh w-full items-center justify-center gap-2">
      <p>
        Hello <span>{data.claims.email}</span>
      </p>
      <LogoutButton />
    </div>
  )
}
