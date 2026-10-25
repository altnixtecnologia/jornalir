import { notFound } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { RentalOperationsPanel } from "../../../../features/comercial/RentalOperationsPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LocacoesPage(): Promise<JSX.Element> {
 const supabase = createSupabaseServerClient();
 const {data:canSee,error:seeError}=await supabase.rpc("staff_can_see_module",{p_module:"publicidade"});
 if(seeError||canSee!==true)notFound();
 const [assets,products,sales,bookings,inspections,canAssets,canBookings,canInspections]=await Promise.all([
  supabase.from("rental_assets")
   .select("id,product_id,asset_code,brand,model,serial_number,status")
   .order("asset_code",{ascending:true}).limit(250),
  supabase.from("commercial_products").select("id,name").eq("channel","equipment_rental").eq("active",true).order("name"),
  supabase.from("commercial_sales")
   .select("id,internal_reference,product_id,channel,items_snapshot,status")
   .in("status",["approved","active"]).order("created_at",{ascending:false}).limit(250),
  supabase.from("rental_bookings")
   .select("id,commercial_sale_id,asset_id,start_at,end_at,status,daily_rate,agreed_total,deposit_amount,collection_location,return_location,contact_person")
   .order("created_at",{ascending:false}).limit(150),
  supabase.from("rental_inspection_events").select("booking_id,event_kind")
   .order("recorded_at",{ascending:false}).limit(400),
  supabase.rpc("staff_can_module_action",{p_module:"publicidade",p_action:"locacao_equipamentos_gerenciar"}),
  supabase.rpc("staff_can_module_action",{p_module:"publicidade",p_action:"locacao_reservas_gerenciar"}),
  supabase.rpc("staff_can_module_action",{p_module:"publicidade",p_action:"locacao_vistorias_registrar"})
 ]);
 const failure=[assets.error,products.error,sales.error,bookings.error,inspections.error,
  canAssets.error,canBookings.error,canInspections.error].find(Boolean);
 if(failure) {
  return <div role="alert">
   Não foi possível carregar as locações. A versão do banco pode estar pendente de atualização.
   Confira as permissões e migrações antes de operar.
  </div>;
 }
 return (
  <>
   <ModuleHeader
    eyebrow="COMERCIAL / LOCAÇÃO"
    title="Equipamentos e locações"
    description="Patrimônios individuais, reserva por venda e vistorias de retirada/devolução."
   />
   <RentalOperationsPanel
    assets={(assets.data??[]) as never[]}
    products={(products.data??[]) as never[]}
    sales={(sales.data??[]) as never[]}
    bookings={(bookings.data??[]) as never[]}
    inspections={(inspections.data??[]) as never[]}
    permissions={{assets:canAssets.data===true,bookings:canBookings.data===true,inspections:canInspections.data===true}}
   />
  </>
 );
}
