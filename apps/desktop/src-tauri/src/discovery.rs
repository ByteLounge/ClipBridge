use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;
use std::error::Error;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

static MDNS_DAEMON: Lazy<Arc<Mutex<Option<ServiceDaemon>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

pub fn start_mdns_advertisement(
    device_id: &str,
    display_name: &str,
    port: u16,
) -> Result<(), Box<dyn Error>> {
    let daemon = ServiceDaemon::new()?;
    let service_type = "_clipbridge._tcp.local.";
    let instance_name = format!("ClipBridge-Desktop-{}", &device_id[0..8]);
    
    let mut properties = HashMap::new();
    properties.insert("id".to_string(), device_id.to_string());
    properties.insert("name".to_string(), display_name.to_string());
    properties.insert("ver".to_string(), "1".to_string());

    // Resolve local ip address
    let my_ip = local_ip_address::local_ip()?.to_string();

    let service_info = ServiceInfo::new(
        service_type,
        &instance_name,
        &format!("{}.local.", instance_name),
        &my_ip,
        port,
        Some(properties),
    )?;

    daemon.register(service_info)?;
    
    let mut global_daemon = MDNS_DAEMON.lock().unwrap();
    *global_daemon = Some(daemon);
    
    println!("mDNS Service registered: {} on {}:{}", instance_name, my_ip, port);
    Ok(())
}

pub fn stop_mdns_advertisement() {
    let mut global_daemon = MDNS_DAEMON.lock().unwrap();
    if let Some(daemon) = global_daemon.take() {
        let _ = daemon.shutdown();
        println!("mDNS Service advertisement stopped.");
    }
}
