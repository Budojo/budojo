<?php

declare(strict_types=1);

namespace App\Enums;

enum DocumentType: string
{
    case IdCard = 'id_card';
    case MedicalCertificate = 'medical_certificate';
    case Insurance = 'insurance';
    case Other = 'other';
}
