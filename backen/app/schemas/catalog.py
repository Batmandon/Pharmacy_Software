from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CatalogInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NamedCreate(CatalogInput):
    name: str = Field(min_length=1, max_length=100)


class NamedEdit(CatalogInput):
    required_on_update: ClassVar[set[str]] = {"name"}

    name: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_edit(self):
        fields_set = self.model_fields_set
        if not fields_set:
            raise ValueError("Provide at least one field to update")
        for field in self.required_on_update & fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class CreateCategory(NamedCreate):
    pass


class EditCategory(NamedEdit):
    pass


class CreateBrand(NamedCreate):
    pass


class EditBrand(NamedEdit):
    pass


class CreateManufacturer(NamedCreate):
    pass


class EditManufacturer(NamedEdit):
    pass


class CreateSalt(NamedCreate):
    pass


class EditSalt(NamedEdit):
    pass


class CreateSupplier(CatalogInput):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=20)
    gstin: str = Field(min_length=1, max_length=15)


class EditSupplier(CatalogInput):
    required_on_update: ClassVar[set[str]] = {"name", "phone", "gstin"}

    name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, min_length=1, max_length=20)
    gstin: str | None = Field(default=None, min_length=1, max_length=15)

    @model_validator(mode="after")
    def validate_edit(self):
        fields_set = self.model_fields_set
        if not fields_set:
            raise ValueError("Provide at least one field to update")
        for field in self.required_on_update & fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self
