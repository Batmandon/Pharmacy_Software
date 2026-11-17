from pydantic import BaseModel, ConfigDict, Field


class CreateAddress(BaseModel):
    # extra="forbid": any field not listed here (e.g. user_id, id) gets a 422
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    line: str = Field(min_length=5, max_length=300)
    city: str = Field(min_length=2, max_length=100, pattern=r"^[A-Za-z\s.'-]+$")
    pincode: str = Field(pattern=r"^[1-9]\d{5}$")  # 6 digits, first digit not 0
    phone: str = Field(pattern=r"^[6-9]\d{9}$")  # 10 digit Indian mobile


class UpdateAddress(CreateAddress):
    # PUT replaces the whole address, so the rules are the same as create.
    # Kept as its own class so edit-only rules can be added later.
    pass
