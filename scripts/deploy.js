const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, vendor] = await hre.ethers.getSigners();
  console.log("Memulai deployment SupplyChainTiket dengan akun:", deployer.address);

  const SupplyChainTiket = await hre.ethers.getContractFactory("SupplyChainTiket");
  const tiket = await SupplyChainTiket.deploy(vendor.address);

  await tiket.waitForDeployment();
  const contractAddress = await tiket.getAddress();

  console.log("Deployment berhasil!");
  console.log("Alamat Kontrak Tiket:", contractAddress);

  // Menyimpan alamat kontrak secara otomatis ke deployment.json (Sesuai Modul 10)
  const deploymentData = {
    contractName: "SupplyChainTiket",
    address: contractAddress,
    vendorAddress: vendor.address,
    network: "localhost",
    chainId: 31337
  };

  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, null, 2));
  console.log("Alamat kontrak berhasil disimpan ke deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});