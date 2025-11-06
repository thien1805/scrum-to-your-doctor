// ...existing code...
"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { createClient } from "@/lib/client";
import { toast } from "sonner";

type Gender = "Male" | "Female" | "Other" | "";

interface ProfileForm {
  fullName: string;
  gender: Gender;
  birthday: string; // ISO date yyyy-mm-dd
  phoneNumber: string;
  identifyCode: string;
}

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [form, setForm] = useState<ProfileForm>({
    fullName: "",
    gender: "",
    birthday: "",
    phoneNumber: "",
    identifyCode: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        router.push('/auth/login');
        return;
      }

      // Check if user already has a profile (patients.id linked to auth.user_id)
      const { data: profile } = await supabase
        .from('patients')
        .select('full_name, gender, dob, phone, citizen_id, id')
        .eq('id', user.id)
        .maybeSingle();

      setUserId(user.id);

      if (profile) {
        // Prefill form from existing profile (trigger-created record)
        setForm({
          fullName: profile.full_name ?? '',
          gender: fromDbGender(profile.gender),
          birthday: profile.dob ?? '',
          phoneNumber: profile.phone ?? '',
          identifyCode: profile.citizen_id ?? '',
        });

        // Determine if profile is complete; if complete, go to protected
      }

      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const validateName = (name: string): boolean => {
    return name.trim().length > 0 && name.trim().length <= 80;
  };

  const validatePhoneNumber = (phone: string): boolean => {
    // Matches standard phone formats: +84... or 0... with 9-11 digits
    const phoneRegex = /^(\+84|0)\d{9,11}$/;
    return phoneRegex.test(phone);
  };

  const validateAge = (birthDate: string): boolean => {
    if (!birthDate) return false;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age > 0;
  };

  const validateIdentifyCode = (code: string): boolean => {
    // Must be exactly 12 digits
    return /^\d{12}$/.test(code);
  };

  // Map giới tính giữa UI và DB
  const toDbGender = (g: Gender): string | null => {
    if (!g) return null;
    switch (g) {
      case "Male":
        return "male";
      case "Female":
        return "female";
      case "Other":
        return "other";
      default:
        return null;
    }
  };

  const fromDbGender = (v?: string | null): Gender => {
    if (!v) return "";
    switch (String(v).toLowerCase()) {
      case "male":
        return "Male";
      case "female":
        return "Female";
      case "other":
        return "Other";
      default:
        return "";
    }
  };

  const handleChange = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    
    if (!validateName(form.fullName)) {
      newErrors.fullName = "Full name must be between 1 and 80 characters";
    }
    
    if (!form.gender) {
      newErrors.gender = "Please select your gender";
    }
    
    if (!validateAge(form.birthday)) {
      newErrors.birthday = "Please enter a valid birth date (age must be positive)";
    }
    
    if (!validatePhoneNumber(form.phoneNumber)) {
      newErrors.phoneNumber = "Please enter a valid phone number (+84... or 0... with 9-11 digits)";
    }
    
    // Address is optional in current DB schema (patients table has no address column)
    
    if (!validateIdentifyCode(form.identifyCode)) {
      newErrors.identifyCode = "National ID must be exactly 12 digits";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !userId) return;

    try {
      setLoading(true);
      const supabase = createClient();
      // Chuẩn hóa payload; đảm bảo kiểu ngày hợp lệ và không gửi chuỗi rỗng
      const payload = {
        id: userId,
        full_name: form.fullName.trim(),
        gender: toDbGender(form.gender),
        dob: form.birthday || null,
        phone: form.phoneNumber.trim(),
        citizen_id: form.identifyCode.trim(),
      };

      // Thực hiện upsert trước, không gọi select để tránh các lỗi hiển thị rỗng {}
      const { error: upsertErr } = await supabase
        .from("patients")
        .upsert(payload, { onConflict: 'id' });

      if (upsertErr && (upsertErr.message || upsertErr.details || upsertErr.hint || upsertErr.code)) {
        console.error("Error saving profile:", upsertErr);
        const msg = [upsertErr.message, upsertErr.details, upsertErr.hint].filter(Boolean).join(" — ");
        toast.error(msg || "Failed to save profile. Please try again.");
        return;
      }

      // Xác minh lại đã lưu bằng cách truy vấn theo id
      const { data: verify, error: verifyErr } = await supabase
        .from('patients')
        .select('id, patient_id')
        .eq('id', userId)
        .maybeSingle();

      if (verifyErr) {
        console.error("Error verifying saved profile:", verifyErr);
        const msg = [verifyErr.message, verifyErr.details, verifyErr.hint].filter(Boolean).join(" — ");
        toast.error(msg || "Profile saved but verification failed.");
        return;
      }

      console.log("Profile saved successfully:", verify);
      setSubmitted(true);
      toast.success("Profile saved successfully!");
      
      // Điều hướng ngay sau khi lưu hồ sơ thành công
      router.push('/view_appointment_list');
    } catch (err) {
      console.error("Error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

  if (loading) {
    return (
      <main className="py-8 px-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-24 text-center">
            Loading...
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="py-8 px-6 max-w-3xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Complete Your Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input 
                id="fullName" 
                value={form.fullName} 
                onChange={handleChange("fullName")} 
                placeholder="Enter your full name"
                maxLength={80}
              />
              {errors.fullName && <p className="text-sm text-destructive mt-1">{errors.fullName}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                value={form.gender}
                onChange={handleChange("gender")}
                className={cn(inputClass)}
              >
                <option value="">-- Select Gender --</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {errors.gender && <p className="text-sm text-destructive mt-1">{errors.gender}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="birthday">Date of Birth</Label>
              <Input 
                id="birthday" 
                type="date" 
                value={form.birthday} 
                onChange={handleChange("birthday")}
              />
              {errors.birthday && <p className="text-sm text-destructive mt-1">{errors.birthday}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input 
                id="phoneNumber" 
                value={form.phoneNumber} 
                onChange={handleChange("phoneNumber")} 
                placeholder="Enter your phone number (e.g., +84... or 0...)"
              />
              {errors.phoneNumber && <p className="text-sm text-destructive mt-1">{errors.phoneNumber}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="identifyCode">National ID Number</Label>
              <Input 
                id="identifyCode" 
                value={form.identifyCode} 
                onChange={handleChange("identifyCode")} 
                placeholder="Enter your 12-digit National ID"
                maxLength={12}
              />
              {errors.identifyCode && <p className="text-sm text-destructive mt-1">{errors.identifyCode}</p>}
            </div>

            <CardFooter className="gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save and Continue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setForm({ 
                    fullName: "", 
                    gender: "", 
                    birthday: "", 
                    phoneNumber: "",
                    identifyCode: "" 
                  });
                  setErrors({});
                  setSubmitted(false);
                }}
              >
                Clear
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
// ...existing code...