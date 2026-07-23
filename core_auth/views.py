import json
import re
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.contrib.auth.decorators import login_required, permission_required
from .models import Quotation, SystemBOM, Invoice, Payment ,Lead ,LeadNote, recompute_invoice_payment_state
from django.db.models import Q
from django.utils.dateparse import parse_date
from django.db import transaction
from django.contrib import messages

def generate_next_quote_number():
    with transaction.atomic():
        last = Quotation.objects.select_for_update().order_by('Quote_id').last()
        next_seq = (last.Quote_id + 1) if last else 1
        return next_seq
def generate_next_invoice_number():
    with transaction.atomic():
        last_invoice = Invoice.objects.select_for_update().order_by('Invoice_id').last()        
        if last_invoice and last_invoice.Invoice_id:
            match = re.search(r'(\d+)$', last_invoice.Invoice_id)
            if match:
                next_seq = int(match.group(1)) + 1
            else:
                next_seq = 1
        else:
            next_seq = 1

        return f"INV-2627-{next_seq:04d}"
@login_required(login_url='/login/')
def dashboard_view(request):
    user_info = {
        'username': request.user.username,
        'role': request.user.email,
    }
    quotations_list = Quotation.objects.all().order_by('-created_at')
    boms_list  = SystemBOM.objects.all().order_by('-updated_at')
    invoice_list = Invoice.objects.all().order_by('-created_at')
    unpaid_invoices = Invoice.objects.filter(payment_status__in=['pending', 'partially_paid'], status='finalized')
    payment_list = Payment.objects.all().order_by('-created_at')
    lead_list = Lead.objects.all().order_by('-created_at')
    count = 0 
    total_outstanding= 0 
    total_paid = 0
    for invoice in invoice_list:
        count += 1
        total_outstanding += invoice.balance_due
        total_paid += invoice.amount_paid
    total_payment = 0
    for payment in payment_list:
        if not payment.is_voided:
            total_payment += payment.amount
    invoice_data = {'invoice_list': invoice_list, 'meta':{'count': count, "total_outstanding": total_outstanding, 'total_paid': total_paid}}
    payment_data = {'payment_list': payment_list, 'total': total_payment}
    context = {
        'user_info': user_info,
        'quotations': quotations_list,
        'boms': boms_list,
        'invoice_data': invoice_data,
        'payment_data': payment_data,
        'lead_list': lead_list,
        'unpaid_invoices': unpaid_invoices
    }
    
    return render(request, 'index.html', context)

@login_required(login_url='/login/')
@permission_required('core_auth.add_quotation', login_url='/dashboard/', raise_exception=False)
def generate_quotation_view(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            lead_id = request.GET.get('from_lead')
            if lead_id:
                lead = get_object_or_404(Lead, id=lead_id)
            Quotation.objects.create(
                Quote_id=data.get("quotation_no", ""),
                Quotation_date=data.get("date", ""),
                Valid_till=data.get("valid_till", ""),

                customer_name=data.get("customer", {}).get("name", ""),
                customer_phone=data.get("customer", {}).get("phone", ""),
                customer_ca_number=data.get("customer", {}).get("ca_number", ""),
                customer_address=data.get("customer", {}).get("address", ""),

                project_type=data.get("project", {}).get("type", ""),
                project_size=data.get("project", {}).get("size", ""),

                items=data.get("items", []),
                subtotal=data.get("subtotal", 0),
                gst_total=data.get("gst_total", 0),
                discount=data.get("discount", 0),
                grand_total=data.get("grand_total", 0),

                source_lead = locals().get('lead', None)
            )


            return JsonResponse({"status": "success"}, status=201)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
    Quote_id = generate_next_quote_number()
    lead_id = request.GET.get('from_lead')
    quotation = {"Quote_id" : Quote_id}
    if lead_id:
        lead = get_object_or_404(Lead, id=lead_id)
        
        quotation = Quotation(
            Quote_id=Quote_id,
            customer_name=lead.name,
            customer_phone=lead.phone,
            project_size=getattr(lead, 'capacity', None),
            project_type=getattr(lead, 'system_type', None),
        )

    return render(
        request, 
        'quote.html', 
        {
            'mode': 'new', 
            'quotation': quotation,
        })

@login_required(login_url='/login/')
@permission_required('core_auth.view_quotation', login_url='/dashboard/', raise_exception=False)
def view_quote_view(request, quote_id):
    try:
        quotation = Quotation.objects.get(Quote_id=quote_id)
        if quotation:
            for item in quotation.items:
                qty = item.get('quantity', 0)
                price = item.get('unit_price', 0)
                gst = item.get('gst_percentage', 0)
                base = qty * price
                item['line_total'] = round(base + (base * gst / 100), 2)

    except Quotation.DoesNotExist:
        return JsonResponse({"error": "Quotation not found"}, status=404)

    return render(request, 'quote.html', {'mode': "view", 'quotation': quotation})

@login_required(login_url='/login/')
@permission_required('core_auth.change_quotation', login_url='/dashboard/', raise_exception=False)
def edit_quote_view(request, quote_id):
    if(request.method == "GET"):
        try:
            quotation = Quotation.objects.get(Quote_id=quote_id)
            if quotation:
                for item in quotation.items:
                    qty = item.get('quantity', 0)
                    price = item.get('unit_price', 0)
                    gst = item.get('gst_percentage', 0)
                    base = qty * price
                    item['line_total'] = round(base + (base * gst / 100), 2)

        except Quotation.DoesNotExist:
            return JsonResponse({"error": "Quotation not found"}, status=404)

        return render(request, 'quote.html', {'mode': "edit", 'quotation': quotation})
    if(request.method == "PUT"):
        try:
            quotation = Quotation.objects.get(Quote_id=quote_id)
        except Quotation.DoesNotExist:
            return JsonResponse(
                {"success": False, "message": "Quotation not found"},
                status=404
            )
        data = json.loads(request.body)

        quotation.Quotation_date = data.get("date", quotation.Quotation_date)
        quotation.Valid_till = data.get("valid_till", quotation.Valid_till)
        quotation.customer_name = data.get("customer", {}).get("name", quotation.customer_name)
        quotation.customer_phone = data.get("customer", {}).get("phone", quotation.customer_phone)
        quotation.customer_ca_number = data.get("customer", {}).get("ca_number", quotation.customer_ca_number)
        quotation.customer_address = data.get("customer", {}).get("address", quotation.customer_address)
        quotation.project_type = data.get("project", {}).get("type", quotation.project_type)
        quotation.project_size = data.get("project", {}).get("size", quotation.project_size)
        quotation.items = data.get("items", quotation.items)

        quotation.subtotal = 0
        quotation.gst_total = 0
        quotation.grand_total = 0
        quotation.discount = data.get("discount", quotation.discount)

        for item in quotation.items:
            quotation.subtotal += item.get('quantity', 0) * item.get('unit_price', 0)
            quotation.gst_total += (item.get('quantity', 0) * item.get('unit_price', 0)) * (item.get('gst_percentage', 0) / 100)
        quotation.grand_total = quotation.subtotal + quotation.gst_total - quotation.discount

        quotation.save()
        return JsonResponse({"success": True, "message": "Quotation updated successfully"}, status=200)

@login_required(login_url='/login/')
@permission_required('core_auth.change_quotation', login_url='/dashboard/', raise_exception=False)
def update_quote_status(request, quote_id):
    if request.method == "PATCH":
        try:
            quotation = Quotation.objects.get(Quote_id=quote_id)
        except Quotation.DoesNotExist:
            return JsonResponse({"error": "Quotation not found"}, status=404)

        data = json.loads(request.body)
        new_status = data.get("status")

        if new_status not in dict(Quotation.STATUS_CHOICES):
            return JsonResponse({"error": "Invalid status value"}, status=400)
        quotation.status = new_status
        quotation.save()
        
        return JsonResponse({"success": True, "message": "Quotation status updated successfully"}, status=200)
    else:
        return JsonResponse({"error": "Invalid request method"}, status=405)
    
@login_required(login_url='/login/')
@permission_required('core_auth.add_systembom', login_url='/dashbaord/', raise_exception=False)
def create_bom(request):
    if(request.method =='POST'):
        try:
            data = json.loads(request.body)
            BOM = SystemBOM.objects.create(
                    package_name = data.get("packageName"),
                    system_type = data.get("bomType"),
                    system_size_kw = data.get("bomCapacity"),
                    items = data.get("items"),
                    profit_amount = data.get("bomMargin")
            )
            BOM.calculate_totals()
            BOM.save()
            return JsonResponse({"status": "success"}, status=201)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
        
@login_required(login_url='/login/')
@permission_required('core_auth.change_systembom', login_url='/dashbaord/', raise_exception=False)
def edit_bom(request, bom_id):
    if(request.method == "GET"):
        try:
            bom = SystemBOM.objects.get(id=bom_id)
            if(bom):
                return JsonResponse({
                    "id": bom.id,
                    "package_name": bom.package_name,
                    "system_type": bom.system_type,
                    "system_size_kw": str(bom.system_size_kw),
                    "profit_amount": str(bom.profit_amount),
                    "items": bom.items
                })
        except SystemBOM.DoesNotExist as e:
            return JsonResponse({"error": str(e)}, status=404)
    if(request.method == "PUT"):
        try:
            BOM = SystemBOM.objects.get(id=bom_id)
        except SystemBOM.DoesNotExist:
            return JsonResponse(
                {"success": False, "message": "BOM not found"},
                status=404
            )
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
        {"success": False, "message": "Invalid JSON"},
        status=400)

        BOM.package_name = data.get("packageName", BOM.package_name)
        BOM.system_type = data.get("bomType", BOM.system_type)
        BOM.system_size_kw = data.get("bomCapacity", BOM.system_size_kw)
        BOM.items = data.get("items", BOM.items)
        BOM.profit_amount = data.get("bomMargin", BOM.profit_amount)

        BOM.calculate_totals()
        BOM.save()

        return JsonResponse({"success": True, "message": "BOM updated successfully"}, status=200)

@login_required(login_url='/login/')
def search_bom_api(request):
    query = request.GET.get('q', '').strip()
    
    if query:
        boms = SystemBOM.objects.filter(Q(package_name__icontains=query) | Q(system_type__icontains=query) | Q(system_size_kw__icontains=query))[:10]
    else:
        boms = SystemBOM.objects.all()[:10]
        
    results = []
    for bom in boms:        
        results.append({
            'id': bom.id,
            'package_name': bom.package_name,
            'system_type': bom.system_type.capitalize(),
            'system_size': bom.system_size_kw,
            'grand_total': round(bom.grand_total, 2),

            'bom_snapshot': {
                'name': bom.package_name,
                'system_type': bom.get_system_type_display(),
                'system_size_kw': str(bom.system_size_kw),
                'profit': float(getattr(bom, 'profit_amount', 15.0)),
                'grand_total': round(bom.grand_total, 2),
                'items': bom.items,
            }
        })
        
    return JsonResponse({'results': results})

@login_required(login_url='/login/')
@permission_required('core_auth.add_invoice', login_url='/dashbaord/', raise_exception=False)
def generate_invoice(request):
    quote_id = request.GET.get('from_quote')
    if request.method == "GET":
        context = {
            'mode': 'new',
            'invoice': None
        }
        if quote_id:
            try:
                quote = Quotation.objects.get(Quote_id=quote_id)
                context['invoice'] = {
                    'customer': {
                        'name': quote.customer_name,
                        'phone': quote.customer_phone,
                        'ca_number': getattr(quote, 'customer_ca_number', ''), 
                        'address': quote.customer_address,
                    },
                    'project': {
                        'type': quote.project_type,
                        'size': quote.project_size,
                    },
                    
                    'items': quote.items if isinstance(quote.items, list) else [],
                    
                    'subtotal': float(quote.subtotal or 0),
                    'gst_total': float(quote.gst_total or 0),
                    'discount': float(quote.discount or 0),
                    'grand_total': float(quote.grand_total or 0),

                    'source_quotation':quote
                }
            except Quotation.DoesNotExist:
                return JsonResponse({
                "status": "failed", 
                "message": "Quotation Does Not Exist"
            }, status=404)
        return render(request, 'invoice.html', context)
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            customer_data = data.get("customer", {})
            project_data = data.get("project", {})
            items_list = data.get("items", []) 
            quotation = None
            if quote_id:
                quotation = get_object_or_404(Quotation, Quote_id=quote_id)
            with transaction.atomic():
                generated_invoice_id = generate_next_invoice_number()
                invoice = Invoice.objects.create(
                    Invoice_id=generated_invoice_id,
                    Invoice_date=parse_date(data.get("date")),
                    status="draft",
                    payment_status="pending",
                    
                    customer_name=customer_data.get("name", "").strip(),
                    customer_phone=customer_data.get("phone", "").strip(),
                    customer_ca_number=customer_data.get("ca_number", "").strip(),
                    customer_address=customer_data.get("address", "").strip(),
                    
                    project_type=project_data.get("type", "").strip().lower(),
                    project_size=project_data.get("size", "").strip(),
                    
                    items=items_list, 
                    
                    subtotal=float(data.get("subtotal", 0.0)),
                    gst_total=float(data.get("gst_total", 0.0)),
                    discount=float(data.get("discount", 0.0)),
                    grand_total=float(data.get("grand_total", 0.0)),
                    amount_paid=0.00, 

                    source_quotation=quotation,
                )

            return JsonResponse({
                "status": "success", 
                "message": "Draft Invoice successfully saved!",
                "invoice_id": generated_invoice_id
            }, status=201)

        except json.JSONDecodeError:
            return JsonResponse({"status": "error", "message": "Malformed JSON payload syntax received."}, status=400)
        except Exception as e:
            return JsonResponse({"status": "error", "message": f"Server processing breakdown: {str(e)}"}, status=500)
        

@login_required(login_url='/login/')
@permission_required('core_auth.view_invoice', login_url='/dashbaord/', raise_exception=False)
def view_invoice(request, inv_id):
    try:
        invoice = Invoice.objects.get(Invoice_id=inv_id)
        context = {
            'mode': 'view',
            'invoice': None
        }
        if invoice:
            context['invoice'] = {
                    'Invoice_id': invoice.Invoice_id,
                    'customer': {
                        'name': invoice.customer_name,
                        'phone': invoice.customer_phone,
                        'ca_number': getattr(invoice, 'customer_ca_number', ''), 
                        'address': invoice.customer_address,
                    },
                    'project': {
                        'type': invoice.project_type,
                        'size': invoice.project_size,
                    },
                    
                    'items': invoice.items if isinstance(invoice.items, list) else [],
                    
                    'subtotal': float(invoice.subtotal or 0),
                    'gst_total': float(invoice.gst_total or 0),
                    'discount': float(invoice.discount or 0),
                    'grand_total': float(invoice.grand_total or 0)
                }
            return render(request, 'invoice.html', context)
    except Invoice.DoesNotExist:
            return JsonResponse({"error": "Invoice not found"}, status=404)
    

@login_required(login_url='/login/')
@permission_required('core_auth.change_invoice', login_url='/dashbaord/', raise_exception=False)
def edit_invoice(request, inv_id):
    if request.method == 'GET':
        try:
            invoice = Invoice.objects.get(Invoice_id=inv_id)
            if(invoice.status == 'finalized'):
                return JsonResponse({'status': 'error', 'message': 'Forbidden action'}, status= 403)
            context = {
            'mode': 'edit',
            'invoice': None}
            if invoice:
                context['invoice'] = {
                        'Invoice_id': invoice.Invoice_id,
                        'customer': {
                            'name': invoice.customer_name,
                            'phone': invoice.customer_phone,
                            'ca_number': getattr(invoice, 'customer_ca_number', ''), 
                            'address': invoice.customer_address,
                        },
                        'project': {
                            'type': invoice.project_type,
                            'size': invoice.project_size,
                        },
                        'items': invoice.items if isinstance(invoice.items, list) else [],
                        'subtotal': float(invoice.subtotal or 0),
                        'gst_total': float(invoice.gst_total or 0),
                        'discount': float(invoice.discount or 0),
                        'grand_total': float(invoice.grand_total or 0)
                    }
                return render(request, 'invoice.html', context)
        except Invoice.DoesNotExist:
            return JsonResponse({"error": "Invoice not found"}, status=404)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            customer_data = data.get("customer", {})
            project_data = data.get("project", {})
            items_list = data.get("items", []) 

            invoice = get_object_or_404(Invoice, Invoice_id=inv_id)
            with transaction.atomic():
                    invoice.Invoice_date=parse_date(data.get("date"))
                    
                    invoice.customer_name=customer_data.get("name", "").strip()
                    invoice.customer_phone=customer_data.get("phone", "").strip()
                    invoice.customer_ca_number=customer_data.get("ca_number", "").strip()
                    invoice.customer_address=customer_data.get("address", "").strip()
                    
                    invoice.project_type=project_data.get("type", "").strip().lower()
                    invoice.project_size=project_data.get("size", "").strip()
                    
                    invoice.items=items_list
                    
                    invoice.subtotal=float(data.get("subtotal", 0.0))
                    invoice.gst_total=float(data.get("gst_total", 0.0))
                    invoice.discount=float(data.get("discount", 0.0))
                    invoice.grand_total=float(data.get("grand_total", 0.0))
            invoice.save()
            return JsonResponse({
                "status": "success", 
                "message": " Invoice successfully updated!",
            }, status=200)

        except json.JSONDecodeError:
            return JsonResponse({"status": "error", "message": "Malformed JSON payload syntax received."}, status=400)
        except Exception as e:
            return JsonResponse({"status": "error", "message": f"Server processing breakdown: {str(e)}"}, status=500)

@login_required(login_url='/login/')
@permission_required('core_auth.change_invoice', login_url='/dashbaord/', raise_exception=False)
def finalize_invoice(request, inv_id):
    if request.method == "POST":
        invoice = get_object_or_404(Invoice, Invoice_id=inv_id)
        
        if invoice.status.lower() == 'draft':
            invoice.status = 'finalized'
            invoice.save()
            messages.success(request, f"Invoice {invoice.Invoice_id} has been successfully finalized.")
        else:
            messages.error(request, "This invoice has already been finalized.")
            
    return redirect('dashboard')

@login_required(login_url='/login/')
@permission_required('core_auth.add_payment', login_url='/dashbaord/', raise_exception=False)
def add_payment(request, invoice_id):
    invoice = get_object_or_404(Invoice, Invoice_id=invoice_id)
 
    if invoice.status != 'finalized':
        return JsonResponse(
            {"status": "error", "message": "Payments can only be recorded on finalized invoices."},
            status=400,
        )
 
    try:
        data = json.loads(request.body)
        amount = float(data.get("amount", 0))
        if amount <= 0:
            return JsonResponse({"status": "error", "message": "Payment amount must be greater than zero."}, status=400)

        if amount > float(invoice.balance_due):
            return JsonResponse(
                {"status": "error", "message": f"Amount exceeds balance due (₹{invoice.balance_due})."},
                status=400,
            )
 
        Payment.objects.create(
            invoice=invoice,
            amount=amount,
            method=data.get("method", "cash"),
            reference_no=data.get("reference_no", "").strip(),
            paid_on=parse_date(data.get("paid_on")),
            notes=data.get("notes", "").strip(),
            recorded_by=request.user if request.user.is_authenticated else None,
        )
 
        updated_invoice = recompute_invoice_payment_state(invoice.id)
 
        return JsonResponse({
            "status": "success",
            "message": "Payment recorded successfully.",
            "amount_paid": str(updated_invoice.amount_paid),
            "balance_due": str(updated_invoice.balance_due),
            "payment_status": updated_invoice.payment_status,
        }, status=201)
 
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Malformed JSON payload."}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
 
@login_required(login_url='/login/')
@permission_required('core_auth.change_payment', login_url='/dashbaord/', raise_exception=False) 
def void_payment(request, payment_id):
    payment = get_object_or_404(Payment, pk=payment_id)
    reason = json.loads(request.body).get("reason", "") if request.body else ""
 
    payment.is_voided = True
    payment.voided_reason = reason.strip()
    payment.save(update_fields=['is_voided', 'voided_reason'])
 
    updated_invoice = recompute_invoice_payment_state(payment.invoice_id)
 
    return JsonResponse({
        "status": "success",
        "message": "Payment voided.",
        "amount_paid": str(updated_invoice.amount_paid),
        "balance_due": str(updated_invoice.balance_due),
        "payment_status": updated_invoice.payment_status,
    }, status=200)
 
@login_required(login_url='/login/')
@permission_required('core_auth.view_payment', login_url='/dashbaord/', raise_exception=False)
def invoice_payments_list(request, invoice_id):
    invoice = get_object_or_404(Invoice, Invoice_id=invoice_id)
    payments = invoice.payments.filter(is_voided=False).order_by('-paid_on', '-created_at')
 
    return JsonResponse({
        "status": "success",
        "grand_total": str(invoice.grand_total),
        "amount_paid": str(invoice.amount_paid),
        "balance_due": str(invoice.balance_due),
        "payment_status": invoice.payment_status,
        "payments": [
            {
                "id": p.id,
                "amount": str(p.amount),
                "method": p.get_method_display(),
                "reference_no": p.reference_no,
                "paid_on": p.paid_on.strftime('%Y-%m-%d'),
                "notes": p.notes,
            }
            for p in payments
        ],
    })

@login_required(login_url='/login/')
@permission_required('core_auth.add_lead', login_url='/dashbaord/', raise_exception=False)
def create_lead(request):
    try:
        data = json.loads(request.body)
 
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        if not name or not phone:
            return JsonResponse({"status": "error", "message": "Name and phone are required."}, status=400)
 
        lead = Lead.objects.create(
            name=name,
            phone=phone,
            email=data.get("email", "").strip(),
            address=data.get("address", "").strip(),
            next_follow_up_date=parse_date(data.get("next_follow_up_date")) if data.get("next_follow_up_date") else None,
            project_type=data.get("project_type", ""),
            estimated_system_size=data.get("estimated_system_size", "").strip(),
            estimated_budget=data.get("estimated_budget") or None,
            referral_source_type=data.get("referral_source_type", ""),
            referral_name=data.get("referral_name", "").strip(),
            status='new',
        )
 
        initial_note = data.get("initial_note", "").strip()
        if initial_note:
            LeadNote.objects.create(lead=lead, note=initial_note)
 
        return JsonResponse({
            "status": "success",
            "message": "Lead added successfully.",
            "lead_id": lead.id,
        }, status=201)
 
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Malformed JSON payload."}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

# ============================================================
# 1. DETAIL PAGE (GET)
# ============================================================
@login_required(login_url='/login/')
@permission_required('core_auth.view_lead', login_url='/dashbaord/', raise_exception=False)
def lead_detail(request, lead_id):
    lead = get_object_or_404(Lead, pk=lead_id)
    return render(request, 'lead_detail.html', {'lead': lead})
 
 
# ============================================================
# 2. EDIT CONTACT / PROJECT / REFERRAL FIELDS
# ============================================================
@login_required(login_url='/login/')
@permission_required('core_auth.change_lead', login_url='/dashbaord/', raise_exception=False)
def update_lead(request, lead_id):
    lead = get_object_or_404(Lead, pk=lead_id)
    try:
        data = json.loads(request.body)
 
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        if not name or not phone:
            return JsonResponse({"status": "error", "message": "Name and phone are required."}, status=400)
 
        lead.name = name
        lead.phone = phone
        lead.email = data.get("email", "").strip()
        lead.address = data.get("address", "").strip()
        lead.project_type = data.get("project_type", "")
        lead.estimated_system_size = data.get("estimated_system_size", "").strip()
        lead.estimated_budget = data.get("estimated_budget") or None
        lead.referral_source_type = data.get("referral_source_type", "")
        lead.referral_name = data.get("referral_name", "").strip()
        lead.save()
 
        return JsonResponse({"status": "success", "message": "Lead updated."})
 
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Malformed JSON payload."}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
 
 
# ============================================================
# 3. STATUS CHANGE — validates 'lost' requires a reason,
#    and auto-logs a status_change LeadNote for the timeline
# ============================================================
@login_required(login_url='/login/')
@permission_required('core_auth.change_lead', login_url='/dashbaord/', raise_exception=False)
def update_lead_status(request, lead_id):
    lead = get_object_or_404(Lead, pk=lead_id)
    try:
        data = json.loads(request.body)
        new_status = data.get("status")
 
        valid_statuses = dict(Lead.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
            return JsonResponse({"status": "error", "message": "Invalid status value."}, status=400)
 
        if new_status == Lead.STATUS_LOST and not data.get("lost_reason"):
            return JsonResponse({"status": "error", "message": "A reason is required to mark a lead as Lost."}, status=400)
 
        # Once converted to a quotation, don't allow silently reverting away
        # from 'quoted' back to an earlier stage — the quotation already exists.
        if lead.quotations.exists() and new_status not in (Lead.STATUS_QUOTED, Lead.STATUS_WON, Lead.STATUS_LOST):
            return JsonResponse(
                {"status": "error", "message": "This lead has already been converted to a quotation and can't move back to an earlier stage."},
                status=400,
            )
 
        old_status_display = lead.get_status_display()
        lead.status = new_status
 
        if new_status == Lead.STATUS_LOST:
            lead.lost_reason = data.get("lost_reason", "")
            lead.lost_reason_notes = data.get("lost_reason_notes", "").strip()
        else:
            # clear stale lost-reason data if a lead is reopened after being marked lost
            lead.lost_reason = ""
            lead.lost_reason_notes = ""
 
        lead.save()
 
        new_status_display = lead.get_status_display()
        LeadNote.objects.create(
            lead=lead,
            note=f"Status changed from '{old_status_display}' to '{new_status_display}'.",
            note_type=LeadNote.TYPE_STATUS_CHANGE,
            created_by=request.user if request.user.is_authenticated else None,
        )
 
        return JsonResponse({"status": "success", "message": "Status updated.", "new_status": new_status})
 
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Malformed JSON payload."}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
 
 
# ============================================================
# 4. FOLLOW-UP SCHEDULING
# ============================================================
@login_required(login_url='/login/')
@permission_required('core_auth.change_lead', login_url='/dashbaord/', raise_exception=False)
def update_lead_followup(request, lead_id):
    lead = get_object_or_404(Lead, pk=lead_id)
    try:
        data = json.loads(request.body)
        date_str = data.get("next_follow_up_date")
        lead.next_follow_up_date = parse_date(date_str) if date_str else None
        lead.save(update_fields=['next_follow_up_date', 'updated_at'])
 
        return JsonResponse({"status": "success", "message": "Follow-up date saved."})
 
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Malformed JSON payload."}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
 
 
# ============================================================
# 5. ADD NOTE
# ============================================================
@login_required(login_url='/login/')
@permission_required('core_auth.add_leadnote', login_url='/dashbaord/', raise_exception=False)
def add_lead_note(request, lead_id):
    lead = get_object_or_404(Lead, pk=lead_id)
    try:
        data = json.loads(request.body)
        note_text = data.get("note", "").strip()
        note_type = data.get("note_type", LeadNote.TYPE_GENERAL)
 
        if not note_text:
            return JsonResponse({"status": "error", "message": "Note text is required."}, status=400)
 
        valid_types = dict(LeadNote.NOTE_TYPE_CHOICES).keys()
        if note_type not in valid_types or note_type == LeadNote.TYPE_STATUS_CHANGE:
            # status_change is system-generated only — never accepted from the client
            note_type = LeadNote.TYPE_GENERAL
 
        note = LeadNote.objects.create(
            lead=lead,
            note=note_text,
            note_type=note_type,
            created_by=request.user if request.user.is_authenticated else None,
        )
 
        return JsonResponse({
            "status": "success",
            "note_id": note.id,
            "note_type_display": note.get_note_type_display(),
            "created_at_display": note.created_at.strftime("%b %d, %Y — %I:%M %p"),
        }, status=201)
 
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Malformed JSON payload."}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
 
 
# ============================================================
# 6. DELETE NOTE
# ============================================================
@login_required(login_url='/login/')
@permission_required('core_auth.delete_leadnote', login_url='/dashbaord/', raise_exception=False)
def delete_lead_note(request, note_id):
    note = get_object_or_404(LeadNote, pk=note_id)
 
    if note.note_type == LeadNote.TYPE_STATUS_CHANGE:
        return JsonResponse(
            {"status": "error", "message": "Status-change history entries can't be deleted."},
            status=400,
        )
 
    note.delete()
    return JsonResponse({"status": "success", "message": "Note deleted."})
 