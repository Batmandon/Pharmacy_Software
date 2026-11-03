from pydantic import BaseModel, ConfigDict, EmailStr, Field

class RegisterAccount(BaseModel):
    first_name: str = Field(min_length=1, max_length=20)
    last_name: str = Field(min_length=1, max_length=20)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=8, max_length=20)

class LoginCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

class UpdateProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    
    first_name: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z\s.'-]+$")
    last_name: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z\s.'-]+$")
    phone: str = Field(min_length=10, max_length=15, pattern=r"^\d+$")